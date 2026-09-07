import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type AgentMsg } from 'src/types/protocol';

type WorktreeFrame = Extract<AgentMsg, { type: `queue.worktree.${string}` }>;

// Provisioning is the only status this may leave: a queue that was already
// running when its agent re-announced a worktree must not be knocked back to
// idle by what is really a confirmation of something it already had.
export async function saveQueueWorktree(opts: {
	queueRepo: QueueRepo;
	socketRegistry: SocketRegistry;
	machineId: string;
	frame: WorktreeFrame;
}): Promise<void> {
	const existing = await opts.queueRepo.getByIdForMachine({
		id: opts.frame.queueId,
		machineId: opts.machineId
	});

	if (!existing || (existing.status !== 'provisioning' && existing.status !== 'failed')) {
		return;
	}

	const queue =
		opts.frame.type === 'queue.worktree.ready'
			? await opts.queueRepo.update({
				id: opts.frame.queueId,
				status: 'idle',
				worktreePath: opts.frame.worktreePath,
				baseRef: opts.frame.baseRef,
				failureReason: null
			})
			: await opts.queueRepo.update({
				id: opts.frame.queueId,
				status: 'failed',
				failureReason: opts.frame.message
			});

	if (queue) {
		announceQueue({ socketRegistry: opts.socketRegistry, queue });
	}
}
