import { describe, expect, it, vi } from 'vitest';
import { saveQueueWorktree } from 'src/controllers/queues/save-queue-worktree';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Queue, type QueueStatus } from 'src/types/QueueSchema';

function queue(status: QueueStatus): Queue {
	return {
		id: 'q_1',
		userId: 'u_1',
		machineId: 'm_1',
		name: 'Auth work',
		slug: 'auth-work',
		worktreePath: null,
		baseRef: null,
		afk: false,
		status,
		failureReason: null,
		createdAt: new Date()
	};
}

function harness(status: QueueStatus) {
	const update = vi.fn().mockImplementation(async (opts) => ({ ...queue(status), ...opts }));
	const queueRepo = {
		getByIdForMachine: vi.fn().mockResolvedValue(queue(status)),
		update
	} as unknown as QueueRepo;
	const socketRegistry = { broadcastToUi: vi.fn() } as unknown as SocketRegistry;

	return { queueRepo, socketRegistry, update };
}

describe('saveQueueWorktree', () => {
	it('records the path and base ref a provisioning queue was given', async () => {
		const { queueRepo, socketRegistry, update } = harness('provisioning');

		await saveQueueWorktree({
			queueRepo,
			socketRegistry,
			machineId: 'm_1',
			frame: {
				type: 'queue.worktree.ready',
				queueId: 'q_1',
				worktreePath: '/home/u/.bosun/worktrees/auth-work',
				baseRef: 'main'
			}
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'idle', baseRef: 'main', failureReason: null })
		);
		expect(socketRegistry.broadcastToUi).toHaveBeenCalled();
	});

	it('records why provisioning failed', async () => {
		const { queueRepo, socketRegistry, update } = harness('provisioning');

		await saveQueueWorktree({
			queueRepo,
			socketRegistry,
			machineId: 'm_1',
			frame: { type: 'queue.worktree.error', queueId: 'q_1', message: 'not a git repository' }
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'failed', failureReason: 'not a git repository' })
		);
	});

	// The ensure is re-sent on every announce, so a running queue receives a
	// `ready` for a worktree it has had for hours. Acting on it would knock a queue
	// mid-execution back to idle and let the scheduler dispatch a second slice.
	it('leaves a running queue alone when its worktree is re-announced', async () => {
		const { queueRepo, socketRegistry, update } = harness('running');

		await saveQueueWorktree({
			queueRepo,
			socketRegistry,
			machineId: 'm_1',
			frame: {
				type: 'queue.worktree.ready',
				queueId: 'q_1',
				worktreePath: '/w',
				baseRef: 'main'
			}
		});

		expect(update).not.toHaveBeenCalled();
	});

	// The frame carries a machine, not a user: a queue belonging to some other
	// machine must not be writable by whoever this socket is.
	it('ignores a queue that is not this machine\'s', async () => {
		const queueRepo = {
			getByIdForMachine: vi.fn().mockResolvedValue(null),
			update: vi.fn()
		} as unknown as QueueRepo;

		await saveQueueWorktree({
			queueRepo,
			socketRegistry: { broadcastToUi: vi.fn() } as unknown as SocketRegistry,
			machineId: 'm_other',
			frame: { type: 'queue.worktree.error', queueId: 'q_1', message: 'x' }
		});

		expect(queueRepo.update).not.toHaveBeenCalled();
	});
});
