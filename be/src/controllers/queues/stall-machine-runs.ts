import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';

const DROPPED = 'the connection to the machine dropped while this bullet was running';

// Reports whether anything was actually stranded, because a queue whose bullet
// is alive must not be paused for a reconnect its session survived.
//
// Back to `pending` rather than `failed`, which is what pausing by hand does and
// for the same reason: the session was killed rather than finished, nothing it
// was working on was committed, and the agent cleans the worktree before it
// starts a bullet — so running it again loses no work and marks no plan as
// having failed.
async function reclaim(
	deps: AdvanceDeps,
	opts: { queueItemId: string; connectedAt: Date; held: Set<string> }
): Promise<boolean> {
	let stranded = false;

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
		deps.runActivity.forget(run.id);
		await deps.sliceRunRepo.update({
			id: run.id,
			status: 'pending',
			failureReason: null,
			// The question went with the session that asked it: the MCP server holding
			// that tool call is gone, so an answer has nowhere to land and leaving it
			// on the row is a control that cannot do anything.
			questionId: null,
			question: null,
			startedAt: null,
			finishedAt: null
		});
	}

	return stranded;
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
	opts: { machineId: string; connectedAt: Date; heldRunIds?: string[] }
): Promise<void> {
	const held = new Set(opts.heldRunIds ?? []);

	for (const queue of await deps.queueRepo.listInFlightForMachine(opts.machineId)) {
		const items = await deps.queueItemRepo.listForQueue(queue.id);
		const running = items.find((item) => item.status === 'running');

		if (!running) {
			continue;
		}

		const stranded = await reclaim(deps, {
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
			failureReason: DROPPED
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
