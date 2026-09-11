import { HttpError } from 'src/api/errors/HttpError';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { resumeAfterRetry } from 'src/controllers/queues/shared/resume-after-retry';

// The verify bullet is the one bullet worth running again on its own. It is the
// only one that drives the app rather than writing it, so what makes it report a
// criterion unverified is usually something about the machine — no browser, an
// app that would not come up — rather than anything about the branch. Retrying
// the whole plan to re-drive it would rebuild every bullet that already landed.
//
// Safe for the same reason: it is the last bullet, so nothing was built on top
// of what it did, and re-running it adds commits to a branch rather than
// rewriting one.
export async function retryVerifyRun(
	deps: AdvanceDeps,
	opts: { queueId: string; itemId: string; projectId: string }
): Promise<void> {
	const queue = await getOwnedQueue({
		queueRepo: deps.queueRepo,
		id: opts.queueId,
		projectId: opts.projectId
	});
	const item = await deps.queueItemRepo.getById(opts.itemId);

	if (!item || item.queueId !== queue.id) {
		throw new HttpError(404, 'Plan not found in that queue');
	}

	const slices = await deps.sliceRepo.listByPlan(item.planId);
	const verify = slices.find((slice) => slice.kind === 'verify');

	if (!verify) {
		throw new HttpError(409, 'That plan has no verify bullet');
	}

	const runs = await deps.sliceRunRepo.listForItem(item.id);
	const run = runs.find((entry) => entry.sliceId === verify.id);

	if (!run) {
		throw new HttpError(409, 'That plan has no verify bullet');
	}

	// The repo refuses the same thing, transactionally — this is only what turns
	// its `null` into an answer rather than a 500. A verify bullet that has not
	// run yet needs no retry, and one in flight is holding the worktree.
	const rearmed = await deps.sliceRunRepo.rearm({ id: run.id, queueItemId: item.id });

	if (!rearmed) {
		throw new HttpError(409, 'Only a verify bullet that has finished can be run again');
	}

	// A plan that closed has to reopen for the bullet to be dispatched at all. One
	// that never closed — the queue is paused, or the plan failed on an earlier
	// bullet — keeps the status it has, and the re-armed bullet is picked up in
	// its turn.
	if (item.status === 'done' || item.status === 'failed' || item.status === 'cancelled') {
		await deps.queueItemRepo.requeue({ id: item.id, queueId: queue.id });
	}

	await resumeAfterRetry(deps, { queue });
}
