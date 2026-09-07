import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export async function deleteQueue(opts: {
	queueRepo: QueueRepo;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
}): Promise<void> {
	const queue = await getOwnedQueue({
		queueRepo: opts.queueRepo,
		id: opts.id,
		userId: opts.userId
	});

	// Sent before the row goes, because the frame carries the slug the agent needs
	// to find the worktree. A machine that never receives it keeps a directory
	// bosun no longer knows about, which `queue.worktree.remove` on the next
	// create of the same slug will clear.
	opts.socketRegistry.sendToAgent({
		machineId: queue.machineId,
		message: { type: 'queue.worktree.remove', queueId: queue.id, slug: queue.slug }
	});

	await opts.queueRepo.remove(queue.id);

	opts.socketRegistry.broadcastToUi({
		userId: opts.userId,
		message: { type: 'queue.deleted', queueId: queue.id }
	});
}
