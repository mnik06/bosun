import { HttpError } from 'src/api/errors/HttpError';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { resumeAfterRetry } from 'src/controllers/queues/shared/resume-after-retry';

export async function retryQueueItem(deps: AdvanceDeps, opts: {
	queueId: string;
	itemId: string;
	projectId: string;
}): Promise<void> {
	const queue = await getOwnedQueue({
		queueRepo: deps.queueRepo,
		id: opts.queueId,
		projectId: opts.projectId
	});

	// Only what has stopped. A plan still running would be dispatched a second
	// time into the worktree the first one is holding.
	const item = await deps.queueItemRepo.requeue({ id: opts.itemId, queueId: queue.id });

	if (!item) {
		throw new HttpError(
			409,
			'Only a plan that failed or has bullets that never ran can be retried'
		);
	}

	await deps.sliceRunRepo.resetUnfinished(item.id);

	await resumeAfterRetry(deps, { queue });
}
