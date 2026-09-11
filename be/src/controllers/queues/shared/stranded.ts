import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { type QueueItem } from 'src/types/QueueSchema';

// One item per queue is ever `running`, and it is the only one holding a
// worktree: every caller settling work a machine left behind starts here.
export async function runningItem(
	deps: AdvanceDeps,
	opts: { queueId: string }
): Promise<QueueItem | null> {
	const items = await deps.queueItemRepo.listForQueue(opts.queueId);

	return items.find((item) => item.status === 'running') ?? null;
}

// Back to `pending` rather than `failed`, which is what pausing by hand does and
// for the same reason: the session was killed rather than finished, nothing it
// was working on was committed, and the agent cleans the worktree before it
// starts a bullet — so running it again loses no work and marks no plan as
// having failed.
export async function reclaimRun(deps: AdvanceDeps, opts: { runId: string }): Promise<void> {
	deps.runActivity.forget(opts.runId);
	await deps.sliceRunRepo.update({
		id: opts.runId,
		status: 'pending',
		failureReason: null,
		// The question went with the session that asked it: the MCP server holding
		// that tool call is gone, so an answer has nowhere to land and leaving it on
		// the row is a control that cannot do anything.
		questionId: null,
		question: null,
		startedAt: null,
		finishedAt: null
	});
}
