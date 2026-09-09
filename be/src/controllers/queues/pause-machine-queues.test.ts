import { describe, expect, it, vi } from 'vitest';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { pauseMachineQueues } from 'src/controllers/queues/pause-machine-queues';

function build(opts?: { running?: boolean }) {
	return {
		queueRepo: {
			listRunnableForMachine: vi.fn().mockResolvedValue([
				{ id: 'q_1', machineId: 'm_1', status: 'running', projectId: 'u_1' }
			]),
			update: vi.fn().mockResolvedValue({ id: 'q_1', projectId: 'u_1', status: 'paused' })
		},
		queueItemRepo: {
			listForQueue: vi
				.fn()
				.mockResolvedValue(
					opts?.running === false ? [] : [{ id: 'qi_1', queueId: 'q_1', status: 'running' }]
				),
			update: vi.fn()
		},
		sliceRunRepo: {
			listForItem: vi.fn().mockResolvedValue([{ id: 'sr_1', status: 'running' }]),
			update: vi.fn()
		},
		socketRegistry: { broadcastToUi: vi.fn(), sendToAgent: vi.fn() }
	} as unknown as AdvanceDeps;
}

describe('pauseMachineQueues', () => {
	// Deliberately not the ordinary failure path. A bullet that fails says what
	// went wrong; a machine that vanished mid-edit leaves a worktree nobody can
	// reason about, and the next plan must not be started on top of it.
	it('pauses rather than carrying on to the next plan', async () => {
		const deps = build();

		await pauseMachineQueues(deps, { machineId: 'm_1' });

		expect(deps.queueRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q_1', status: 'paused' })
		);
	});

	it('settles the run and the plan that were in flight', async () => {
		const deps = build();

		await pauseMachineQueues(deps, { machineId: 'm_1' });

		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', status: 'failed' })
		);
		expect(deps.queueItemRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'qi_1', status: 'failed' })
		);
	});

	// An idle queue lost nothing when the socket dropped, so pausing it would
	// leave the operator with a queue to un-pause for no reason.
	it('leaves a queue with nothing running alone', async () => {
		const deps = build({ running: false });

		await pauseMachineQueues(deps, { machineId: 'm_1' });

		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});
});
