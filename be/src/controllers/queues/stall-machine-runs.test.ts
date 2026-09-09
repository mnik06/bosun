import { describe, expect, it, vi } from 'vitest';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { stallMachineRuns } from 'src/controllers/queues/stall-machine-runs';

const CONNECTED_AT = new Date('2026-09-09T12:03:33Z');
const BEFORE = new Date('2026-09-09T12:02:37Z');
const AFTER = new Date('2026-09-09T12:03:34Z');

function build(opts?: {
	startedAt?: Date | null;
	runStatus?: string;
	itemStatus?: string;
	machineId?: string;
}) {
	const run = {
		id: 'sr_1',
		queueItemId: 'qi_1',
		status: opts?.runStatus ?? 'running',
		startedAt: opts?.startedAt === undefined ? BEFORE : opts.startedAt
	};

	return {
		queueRepo: {
			listInFlightForMachine: vi
				.fn()
				.mockResolvedValue([{ id: 'q_1', machineId: 'm_1', status: 'running', projectId: 'u_1' }]),
			getById: vi
				.fn()
				.mockResolvedValue({ id: 'q_1', machineId: opts?.machineId ?? 'm_1', projectId: 'u_1' }),
			update: vi.fn().mockResolvedValue({ id: 'q_1', projectId: 'u_1', status: 'paused' })
		},
		queueItemRepo: {
			listForQueue: vi
				.fn()
				.mockResolvedValue([
					{ id: 'qi_1', queueId: 'q_1', status: opts?.itemStatus ?? 'running' }
				]),
			getById: vi.fn().mockResolvedValue({ id: 'qi_1', queueId: 'q_1' })
		},
		sliceRunRepo: {
			listForItem: vi.fn().mockResolvedValue([run]),
			getById: vi.fn().mockResolvedValue(run),
			update: vi.fn()
		},
		runActivity: { forget: vi.fn() },
		socketRegistry: { broadcastToUi: vi.fn(), sendToAgent: vi.fn() }
	} as unknown as AdvanceDeps;
}

describe('stallMachineRuns', () => {
	// The bug this exists for: the agent reconnected fast enough to keep the
	// registry slot, so the close handler bailed and nobody settled the bullet the
	// old socket had already killed. `claimNext` then refused to take the next one
	// for as long as that ghost sat there, which is a queue stuck for good.
	it('puts a run the previous connection stranded back to pending', async () => {
		const deps = build();

		await stallMachineRuns(deps, { machineId: 'm_1', connectedAt: CONNECTED_AT });

		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', status: 'pending', startedAt: null })
		);
	});

	// Not `failed`: the session was killed rather than finished, nothing it was
	// working on was committed, and the worktree is cleaned before the next start.
	// Failing it would mark a plan as having failed for a dropped TCP connection.
	it('does not fail the plan the bullet belongs to', async () => {
		const deps = build();

		await stallMachineRuns(deps, { machineId: 'm_1', connectedAt: CONNECTED_AT });

		expect(deps.queueRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q_1', status: 'paused' })
		);
	});

	// The question died with the session that asked it, so an answer has nowhere to
	// land; leaving it on the row is a control that cannot do anything.
	it('clears the question the dead session was holding', async () => {
		const deps = build();

		await stallMachineRuns(deps, { machineId: 'm_1', connectedAt: CONNECTED_AT });

		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ questionId: null, question: null })
		);
	});

	// Execution sessions outlive the socket they were dispatched over. Resetting a
	// run the agent is still building would abandon a `claude` mid-edit and hand
	// the same bullet out again on resume.
	it('leaves a run the agent still holds alone', async () => {
		const deps = build();

		await stallMachineRuns(deps, {
			machineId: 'm_1',
			connectedAt: CONNECTED_AT,
			heldRunIds: ['sr_1']
		});

		expect(deps.sliceRunRepo.update).not.toHaveBeenCalled();
		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});

	// A resume racing the hello dispatches over the new socket. Resetting that
	// bullet would have the reconnect kill the run that came after it.
	it('leaves a run this connection was given alone', async () => {
		const deps = build({ startedAt: AFTER });

		await stallMachineRuns(deps, { machineId: 'm_1', connectedAt: CONNECTED_AT });

		expect(deps.sliceRunRepo.update).not.toHaveBeenCalled();
		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});

	it('leaves a queue with nothing in flight alone', async () => {
		const deps = build({ runStatus: 'done' });

		await stallMachineRuns(deps, { machineId: 'm_1', connectedAt: CONNECTED_AT });

		expect(deps.sliceRunRepo.update).not.toHaveBeenCalled();
		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});

	it('leaves a queue with no running plan alone', async () => {
		const deps = build({ itemStatus: 'queued' });

		await stallMachineRuns(deps, { machineId: 'm_1', connectedAt: CONNECTED_AT });

		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});

	// The mirror case. Pausing a queue while the machine was unreachable could not
	// deliver `exec.cancel`, so the session kept writing to a worktree the operator
	// had stopped to look at.
	it('cancels a held run bosun no longer wants', async () => {
		const deps = build({ runStatus: 'pending' });

		await stallMachineRuns(deps, {
			machineId: 'm_1',
			connectedAt: CONNECTED_AT,
			heldRunIds: ['sr_1']
		});

		expect(deps.socketRegistry.sendToAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				machineId: 'm_1',
				message: { type: 'exec.cancel', runId: 'sr_1' }
			})
		);
	});

	// Derived rather than trusted: an agent must not keep a session alive by
	// naming a run that belongs to another machine.
	it('cancels a held run that belongs to another machine', async () => {
		const deps = build({ machineId: 'm_2' });

		await stallMachineRuns(deps, {
			machineId: 'm_1',
			connectedAt: CONNECTED_AT,
			heldRunIds: ['sr_1']
		});

		expect(deps.socketRegistry.sendToAgent).toHaveBeenCalledWith(
			expect.objectContaining({ message: { type: 'exec.cancel', runId: 'sr_1' } })
		);
	});

	it('leaves a held run bosun still wants running', async () => {
		const deps = build();

		await stallMachineRuns(deps, {
			machineId: 'm_1',
			connectedAt: CONNECTED_AT,
			heldRunIds: ['sr_1']
		});

		expect(deps.socketRegistry.sendToAgent).not.toHaveBeenCalled();
	});
});
