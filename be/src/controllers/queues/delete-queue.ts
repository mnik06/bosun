import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export async function deleteQueue(opts: {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	sliceRunRepo: SliceRunRepo;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
}): Promise<void> {
	const queue = await getOwnedQueue({
		queueRepo: opts.queueRepo,
		id: opts.id,
		userId: opts.userId
	});

	// The session goes first. Removing the worktree under a `claude` process that
	// is still writing to it leaves the process alive with a deleted cwd, and the
	// rows it would report against are about to disappear.
	const items = await opts.queueItemRepo.listForQueue(queue.id);
	const running = items.find((item) => item.status === 'running');

	for (const run of running ? await opts.sliceRunRepo.listForItem(running.id) : []) {
		if (run.status === 'running') {
			opts.socketRegistry.sendToAgent({
				machineId: queue.machineId,
				message: { type: 'exec.cancel', runId: run.id }
			});
		}
	}

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
