import { HttpError } from 'src/api/errors/HttpError';
import { advanceQueue, type AdvanceDeps } from 'src/controllers/queues/advance-queue';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';

export async function retryQueueItem(deps: AdvanceDeps, opts: {
	queueId: string;
	itemId: string;
	userId: string;
}): Promise<void> {
	const queue = await getOwnedQueue({
		queueRepo: deps.queueRepo,
		id: opts.queueId,
		userId: opts.userId
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

	// A queue that failed on this plan has to come off that status itself, or it
	// keeps the item queued and dispatches nothing. `paused` is left alone: the
	// operator paused it deliberately, and retrying one plan is not a request to
	// start the whole queue moving again.
	if (queue.status === 'failed') {
		const updated = await deps.queueRepo.update({
			id: queue.id,
			status: 'idle',
			failureReason: null
		});

		if (updated) {
			announceQueue({ socketRegistry: deps.socketRegistry, queue: updated });
		}
	}

	await advanceQueue(deps, { queueId: queue.id });
}
