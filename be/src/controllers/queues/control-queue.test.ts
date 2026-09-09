import { describe, expect, it, vi } from 'vitest';
import { type AdvanceDeps } from 'src/controllers/queues/advance-queue';
import { controlQueue } from 'src/controllers/queues/control-queue';
import { type Queue, type QueueStatus } from 'src/types/QueueSchema';

function queue(status: QueueStatus): Queue {
	return {
		id: 'q_1',
		userId: 'u_1',
		machineId: 'm_1',
		name: 'Auth',
		slug: 'auth',
		worktreePath: '/w',
		baseRef: 'main',
		afk: false,
		portBase: 4100,
		status,
		failureReason: null,
		createdAt: new Date()
	};
}

function build(status: QueueStatus, opts?: { running?: boolean }) {
	const items = opts?.running
		? [{ id: 'qi_1', queueId: 'q_1', planId: 'p_1', status: 'running' }]
		: [];

	return {
		queueRepo: {
			getOwnedById: vi.fn().mockResolvedValue(queue(status)),
			getById: vi.fn().mockResolvedValue(queue(status)),
			update: vi.fn().mockImplementation(async (o) => ({ ...queue(status), ...o })),
			listRunnableForMachine: vi.fn().mockResolvedValue([]),
			countRunningForMachine: vi.fn().mockResolvedValue(0)
		},
		queueItemRepo: {
			listForQueue: vi.fn().mockResolvedValue(items),
			claimNext: vi.fn().mockResolvedValue(null),
			update: vi.fn()
		},
		sliceRunRepo: {
			listForItem: vi.fn().mockResolvedValue([
				{ id: 'sr_1', queueItemId: 'qi_1', ordinal: 1, status: 'running' }
			]),
			claimNext: vi.fn().mockResolvedValue(null),
			update: vi.fn()
		},
		planRepo: { getByIdForMachine: vi.fn() },
		sliceRepo: { listByPlan: vi.fn().mockResolvedValue([]) },
		acRepo: { listBySlice: vi.fn().mockResolvedValue([]) },
		socketRegistry: { sendToAgent: vi.fn(), broadcastToUi: vi.fn() }
	} as unknown as AdvanceDeps;
}

describe('controlQueue', () => {
	// Pausing stops the work rather than the dispatching, and re-arms it: the plan
	// is not cancelled and the bullet is not failed, so resuming runs that same
	// bullet again instead of skipping to the next plan.
	it('pausing kills the bullet and re-arms it', async () => {
		const deps = build('running', { running: true });

		await controlQueue(deps, { id: 'q_1', userId: 'u_1', action: 'pause' });

		expect(deps.socketRegistry.sendToAgent).toHaveBeenCalledWith(
			expect.objectContaining({ message: { type: 'exec.cancel', runId: 'sr_1' } })
		);
		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', status: 'pending', startedAt: null })
		);
		expect(deps.queueItemRepo.update).not.toHaveBeenCalled();
		expect(deps.queueRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q_1', status: 'paused' })
		);
	});

	it('resuming clears the pause and looks for work', async () => {
		const deps = build('paused');

		await controlQueue(deps, { id: 'q_1', userId: 'u_1', action: 'resume' });

		expect(deps.queueRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q_1', status: 'idle' })
		);
	});

	// Resuming would take the queue off `blocked` while the session is still
	// sitting inside the tool call, and the next dispatch would put a second
	// process in the same worktree.
	it('refuses to resume a queue that is waiting on a question', async () => {
		const deps = build('blocked');

		await expect(
			controlQueue(deps, { id: 'q_1', userId: 'u_1', action: 'resume' })
		).rejects.toThrow(/answer it/);
	});

	it('refuses to control a queue with no worktree yet', async () => {
		const deps = build('provisioning');

		await expect(
			controlQueue(deps, { id: 'q_1', userId: 'u_1', action: 'pause' })
		).rejects.toThrow(/no worktree/);
	});
});
