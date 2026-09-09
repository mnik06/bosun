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
	opts: { queueItemId: string; connectedAt: Date }
): Promise<boolean> {
	let stranded = false;

	for (const run of await deps.sliceRunRepo.listForItem(opts.queueItemId)) {
		// A run that started after this connection opened was dispatched over it and
		// is alive. Without the comparison, a resume racing the hello would have its
		// fresh bullet reset by the reconnect that came before it.
		if (run.status !== 'running' || (run.startedAt !== null && run.startedAt > opts.connectedAt)) {
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

// The agent's sessions are per-connection: when its socket closes it kills every
// `claude` process it was holding, whether or not it reconnects a second later.
// A fresh connection is therefore proof that nothing bosun still counts as
// running is actually running over there — every `running` row that predates it
// describes a process that no longer exists.
//
// Nothing settled those before. The close that killed them was a *replaced*
// socket: `unregisterAgentSocket` refuses to evict the live connection,
// `handleClose` returns on that, and `pauseMachineQueues` never ran. The queue
// was then stuck for good rather than for a moment, because `claimNext` will not
// take the next bullet while one is in flight and the one in flight was a ghost.
//
// The queue still stops, because a bullet cut off mid-edit is not one anybody
// watched finish.
export async function stallMachineRuns(
	deps: AdvanceDeps,
	opts: { machineId: string; connectedAt: Date }
): Promise<void> {
	for (const queue of await deps.queueRepo.listInFlightForMachine(opts.machineId)) {
		const items = await deps.queueItemRepo.listForQueue(queue.id);
		const running = items.find((item) => item.status === 'running');

		if (!running) {
			continue;
		}

		const stranded = await reclaim(deps, {
			queueItemId: running.id,
			connectedAt: opts.connectedAt
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
}
