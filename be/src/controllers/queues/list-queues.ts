import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type Queue } from 'src/types/QueueSchema';

export async function listQueues(opts: {
	queueRepo: QueueRepo;
	userId: string;
	machineId?: string;
}): Promise<Queue[]> {
	return opts.machineId === undefined
		? opts.queueRepo.listOwned(opts.userId)
		: opts.queueRepo.listForMachine({ machineId: opts.machineId, userId: opts.userId });
}
