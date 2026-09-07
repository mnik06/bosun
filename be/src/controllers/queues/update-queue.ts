import { HttpError } from 'src/api/errors/HttpError';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Queue } from 'src/types/QueueSchema';

// Read at dispatch, so flipping it mid-plan takes effect on the next bullet
// rather than the one already running: a session's tool list is fixed when it
// starts, and there is no way to take `bosun_ask` back from it afterwards.
export async function updateQueue(opts: {
	queueRepo: QueueRepo;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
	afk: boolean;
}): Promise<Queue> {
	await getOwnedQueue({ queueRepo: opts.queueRepo, id: opts.id, userId: opts.userId });

	const updated = await opts.queueRepo.update({ id: opts.id, afk: opts.afk });

	if (!updated) {
		throw new HttpError(404, 'Queue not found');
	}

	announceQueue({ socketRegistry: opts.socketRegistry, queue: updated });

	return updated;
}
