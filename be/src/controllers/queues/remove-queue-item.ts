import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';

// Only a plan that has not started. One already running holds the worktree, and
// one that finished is the record of what the queue did — neither is something
// to make disappear from a list.
export async function removeQueueItem(opts: {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	queueId: string;
	itemId: string;
	userId: string;
}): Promise<void> {
	await getOwnedQueue({ queueRepo: opts.queueRepo, id: opts.queueId, userId: opts.userId });

	if (!(await opts.queueItemRepo.removeQueued({ id: opts.itemId, queueId: opts.queueId }))) {
		throw new HttpError(409, 'Only a plan that has not started yet can be removed');
	}
}
