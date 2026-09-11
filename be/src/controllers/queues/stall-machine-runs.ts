import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { reclaimRun, runningItem } from 'src/controllers/queues/shared/stranded';

const DROPPED = 'the connection to the machine dropped while this bullet was running';
const RESTARTED = 'the agent on the machine restarted while this bullet was running';

// Both describe the same row — a bullet this machine was building and no longer
// holds a session for — and they are worth telling apart, because they send the
// operator to different places. A socket that dropped is the network. An agent
// process that began *after* the bullet was dispatched is not the process that
// was building it: it was killed and brought back, which on a machine that keeps
// doing it is a box running out of memory rather than a flaky link.
//
// Agents too old to send their uptime read as a dropped connection, which is what
// they always were: they held nothing across a reconnect either way.
function strandedReason(opts: { agentStartedAt: Date | null; runStartedAt: Date | null }): string {
	if (opts.agentStartedAt === null || opts.runStartedAt === null) {
		return DROPPED;
	}

	return opts.agentStartedAt > opts.runStartedAt ? RESTARTED : DROPPED;
}

// Reports whether anything was actually stranded, because a queue whose bullet
// is alive must not be paused for a reconnect its session survived.
async function reclaim(
	deps: AdvanceDeps,
	opts: { queueItemId: string; connectedAt: Date; held: Set<string> }
): Promise<{ stranded: boolean; runStartedAt: Date | null }> {
	let stranded = false;
	let runStartedAt: Date | null = null;

	for (const run of await deps.sliceRunRepo.listForItem(opts.queueItemId)) {
		// A run the agent still holds a session for outlived the socket it was
		// dispatched over and is still building; one that started after this
		// connection opened was dispatched over it. Either way the process is real,
		// and resetting the row would abandon a `claude` that is mid-edit.
		if (run.status !== 'running' || opts.held.has(run.id)) {
			continue;
		}

		if (run.startedAt !== null && run.startedAt > opts.connectedAt) {
			continue;
		}

		stranded = true;
		runStartedAt = runStartedAt ?? run.startedAt;
		await reclaimRun(deps, { runId: run.id });
	}

	return { stranded, runStartedAt };
}

// The queue is derived from the run rather than trusted, the same as every other
// frame that names one: an agent must not keep a session alive by claiming to
// hold a run on somebody else's machine.
async function abandoned(
	deps: AdvanceDeps,
	opts: { runId: string; machineId: string }
): Promise<boolean> {
	const run = await deps.sliceRunRepo.getById(opts.runId);

	if (run === null || run.status !== 'running') {
		return true;
	}

	const item = await deps.queueItemRepo.getById(run.queueItemId);
	const queue = item === null ? null : await deps.queueRepo.getById(item.queueId);

	return queue === null || queue.machineId !== opts.machineId;
}

// The agent's ask sessions are per-connection, but its execution and planning
// sessions are not: a bullet keeps building through a reconnect and reports on
// whatever socket is current when it settles. `hello` therefore carries the runs
// it still holds, and everything else this machine has marked `running` died with
// the socket before this one. `stallMachinePlans` is the same mechanism for
// grills.
//
// Nothing settled those before. The close that killed them was often a *replaced*
// socket: `unregisterAgentSocket` refuses to evict the live connection,
// `handleClose` returns on that, and `pauseMachineQueues` never ran. The queue
// was then stuck for good rather than for a moment, because `claimNext` will not
// take the next bullet while one is in flight and the one in flight was a ghost.
//
// An agent too old to send `runIds` holds nothing across a reconnect, so the
// empty default is not a fallback — it is the truth for those agents.
export async function stallMachineRuns(
	deps: AdvanceDeps,
	opts: { machineId: string; connectedAt: Date; heldRunIds?: string[]; uptimeMs?: number }
): Promise<void> {
	const held = new Set(opts.heldRunIds ?? []);
	const agentStartedAt =
		opts.uptimeMs === undefined ? null : new Date(Date.now() - opts.uptimeMs);

	for (const queue of await deps.queueRepo.listInFlightForMachine(opts.machineId)) {
		const running = await runningItem(deps, { queueId: queue.id });

		if (!running) {
			continue;
		}

		const { stranded, runStartedAt } = await reclaim(deps, {
			queueItemId: running.id,
			connectedAt: opts.connectedAt,
			held
		});

		if (!stranded) {
			continue;
		}

		const paused = await deps.queueRepo.update({
			id: queue.id,
			status: 'paused',
			failureReason: strandedReason({ agentStartedAt, runStartedAt })
		});

		if (paused) {
			announceQueue({ socketRegistry: deps.socketRegistry, queue: paused });
		}
	}

	// The other direction. The agent is still building a bullet bosun no longer
	// wants — the queue was paused, or the plan failed, while the connection was
	// down and `exec.cancel` could not be delivered. Left alone it carries on
	// writing to a worktree nobody is watching, and commits over whatever the
	// operator paused it to look at.
	for (const runId of held) {
		if (await abandoned(deps, { runId, machineId: opts.machineId })) {
			deps.socketRegistry.sendToAgent({
				machineId: opts.machineId,
				message: { type: 'exec.cancel', runId }
			});
		}
	}
}
