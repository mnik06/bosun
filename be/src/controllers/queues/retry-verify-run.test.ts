import { describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { retryVerifyRun } from 'src/controllers/queues/retry-verify-run';

function build(opts?: {
	queueStatus?: string;
	itemStatus?: string;
	slices?: { id: string; kind: string }[];
	rearmed?: boolean;
}) {
	const queue = {
		id: 'q_1',
		projectId: 'u_1',
		machineId: 'm_1',
		status: opts?.queueStatus ?? 'idle',
		// Stops `advanceQueue` short: what this controller does to the rows is the
		// subject, and dispatching is covered where dispatching lives.
		worktreePath: null
	};

	return {
		queueRepo: {
			getOwnedById: vi.fn().mockResolvedValue(queue),
			getById: vi.fn().mockResolvedValue(queue),
			update: vi.fn().mockResolvedValue({ ...queue, status: 'idle' })
		},
		queueItemRepo: {
			getById: vi.fn().mockResolvedValue({
				id: 'qi_1',
				queueId: 'q_1',
				planId: 'p_1',
				status: opts?.itemStatus ?? 'done'
			}),
			listForQueue: vi.fn().mockResolvedValue([]),
			requeue: vi.fn().mockResolvedValue({ id: 'qi_1', queueId: 'q_1', status: 'queued' })
		},
		sliceRepo: {
			listByPlan: vi
				.fn()
				.mockResolvedValue(
					opts?.slices ?? [
						{ id: 's_1', kind: 'build' },
						{ id: 's_2', kind: 'verify' }
					]
				)
		},
		sliceRunRepo: {
			listForItem: vi.fn().mockResolvedValue([
				{ id: 'sr_1', sliceId: 's_1', status: 'done' },
				{ id: 'sr_2', sliceId: 's_2', status: 'done' }
			]),
			rearm: vi
				.fn()
				.mockResolvedValue(opts?.rearmed === false ? null : { id: 'sr_2', status: 'pending' })
		},
		socketRegistry: { broadcastToUi: vi.fn(), sendToAgent: vi.fn() }
	} as unknown as AdvanceDeps;
}

const opts = { queueId: 'q_1', itemId: 'qi_1', projectId: 'u_1' };

describe('retryVerifyRun', () => {
	// The point of the whole control: the build bullets keep their commits and
	// only the bullet that drives the app runs again.
	it('re-arms the verify bullet and leaves the build bullets alone', async () => {
		const deps = build();

		await retryVerifyRun(deps, opts);

		expect(deps.sliceRunRepo.rearm).toHaveBeenCalledWith({ id: 'sr_2', queueItemId: 'qi_1' });
		expect(deps.sliceRunRepo.rearm).toHaveBeenCalledTimes(1);
	});

	// A plan that closed dispatches nothing until it reopens.
	it('reopens a plan that had finished', async () => {
		const deps = build();

		await retryVerifyRun(deps, opts);

		expect(deps.queueItemRepo.requeue).toHaveBeenCalledWith({ id: 'qi_1', queueId: 'q_1' });
	});

	// The plan is mid-flight — the queue is paused, or an earlier bullet failed.
	// Requeuing it would take it off the status it is actually in.
	it('leaves a plan that never closed where it is', async () => {
		const deps = build({ itemStatus: 'running' });

		await retryVerifyRun(deps, opts);

		expect(deps.queueItemRepo.requeue).not.toHaveBeenCalled();
	});

	it('brings a queue that failed on this plan back to idle', async () => {
		const deps = build({ queueStatus: 'failed' });

		await retryVerifyRun(deps, opts);

		expect(deps.queueRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q_1', status: 'idle', failureReason: null })
		);
	});

	// Paused is a person's decision about the whole queue; re-running one bullet
	// is not a request to undo it.
	it('leaves a paused queue paused', async () => {
		const deps = build({ queueStatus: 'paused' });

		await retryVerifyRun(deps, opts);

		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});

	it('refuses a plan with no verify bullet', async () => {
		const deps = build({ slices: [{ id: 's_1', kind: 'build' }] });

		await expect(retryVerifyRun(deps, opts)).rejects.toBeInstanceOf(HttpError);
		expect(deps.sliceRunRepo.rearm).not.toHaveBeenCalled();
	});

	// The repo refuses a bullet that is pending or in flight, transactionally.
	// This is only that answer reaching the caller as a 409 rather than a 500.
	it('refuses when the verify bullet has not finished', async () => {
		const deps = build({ rearmed: false });

		await expect(retryVerifyRun(deps, opts)).rejects.toMatchObject({ statusCode: 409 });
		expect(deps.queueItemRepo.requeue).not.toHaveBeenCalled();
	});
});
