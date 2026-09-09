import { HttpError } from 'src/api/errors/HttpError';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type Queue } from 'src/types/QueueSchema';

export async function getOwnedQueue(opts: {
	queueRepo: QueueRepo;
	id: string;
	projectId: string;
}): Promise<Queue> {
	const queue = await opts.queueRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	if (!queue) {
		throw new HttpError(404, 'Queue not found');
	}

	return queue;
}
