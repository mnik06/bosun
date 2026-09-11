import { describe, expect, it, vi } from 'vitest';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { pauseMachineQueues } from 'src/controllers/queues/pause-machine-queues';

function build(opts?: { running?: boolean; reconnected?: boolean }) {
	return {
		queueRepo: {
			listInFlightForMachine: vi.fn().mockResolvedValue([
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
		runActivity: { forget: vi.fn() },
		socketRegistry: {
			broadcastToUi: vi.fn(),
			sendToAgent: vi.fn(),
			getAgentSocket: vi.fn().mockReturnValue(opts?.reconnected ? {} : null)
		}
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

	// Nothing the session was working on was committed, and the agent cleans the
	// worktree before each bullet: failing the plan would report work as lost that
	// resuming simply runs again.
	it('sends the stranded bullet back to pending rather than failing it', async () => {
		const deps = build();

		await pauseMachineQueues(deps, { machineId: 'm_1' });

		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', status: 'pending', startedAt: null })
		);
		expect(deps.queueItemRepo.update).not.toHaveBeenCalled();
	});

	// The window can outlive the outage. Settling a run the agent is reporting on
	// again is what made the following `hello` cancel a live `claude`.
	it('leaves everything alone when the machine reconnected', async () => {
		const deps = build({ reconnected: true });

		await pauseMachineQueues(deps, { machineId: 'm_1' });

		expect(deps.queueRepo.listInFlightForMachine).not.toHaveBeenCalled();
		expect(deps.sliceRunRepo.update).not.toHaveBeenCalled();
		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});

	// An idle queue lost nothing when the socket dropped, so pausing it would
	// leave the operator with a queue to un-pause for no reason.
	it('leaves a queue with nothing running alone', async () => {
		const deps = build({ running: false });

		await pauseMachineQueues(deps, { machineId: 'm_1' });

		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});
});
