import { describe, expect, it, vi } from 'vitest';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { recordExecFrame } from 'src/controllers/queues/record-exec-frame';

function build(opts?: { machineId?: string; runStatus?: string }) {
	const deps = {
		queueRepo: {
			getById: vi.fn().mockResolvedValue({
				id: 'q_1',
				machineId: opts?.machineId ?? 'm_1',
				slug: 'auth',
				status: 'running',
				worktreePath: '/w',
				baseRef: 'main',
				afk: false
			}),
			update: vi.fn().mockResolvedValue(null),
			countRunningForMachine: vi.fn().mockResolvedValue(0),
			listRunnableForMachine: vi.fn().mockResolvedValue([])
		},
		queueItemRepo: {
			getById: vi.fn().mockResolvedValue({ id: 'qi_1', queueId: 'q_1', planId: 'p_1' }),
			listForQueue: vi.fn().mockResolvedValue([]),
			claimNext: vi.fn().mockResolvedValue(null),
			update: vi.fn()
		},
		sliceRunRepo: {
			getById: vi.fn().mockResolvedValue({
				id: 'sr_1',
				queueItemId: 'qi_1',
				ordinal: 1,
				status: opts?.runStatus ?? 'running'
			}),
			claimNext: vi.fn().mockResolvedValue(null),
			listForItem: vi.fn().mockResolvedValue([]),
			setQuestion: vi.fn(),
			update: vi.fn()
		},
		planRepo: { getByIdForMachine: vi.fn() },
		sliceRepo: { listByPlan: vi.fn().mockResolvedValue([]) },
		acRepo: { listBySlice: vi.fn().mockResolvedValue([]) },
		socketRegistry: { sendToAgent: vi.fn(), broadcastToUi: vi.fn() },
		runActivity: { record: vi.fn(), forget: vi.fn(), label: vi.fn() }
	} as unknown as AdvanceDeps;

	return deps;
}

const base = { machineId: 'm_1', projectId: 'u_1' };

describe('recordExecFrame', () => {
	it('records the commit a finished bullet made', async () => {
		const deps = build();

		await recordExecFrame(deps, {
			...base,
			frame: { type: 'exec.done', runId: 'sr_1', commitSha: 'abc123', report: 'done' }
		});

		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', status: 'done', commitSha: 'abc123' })
		);
	});

	// The question is the only thing that can unblock the queue, and it used to
	// live in the browser's socket state: a reload lost the control that answers
	// it while the session sat waiting.
	it('stores the question a blocked run is waiting on, and clears it when the run settles', async () => {
		const deps = build();

		await recordExecFrame(deps, {
			...base,
			frame: {
				type: 'exec.question',
				runId: 'sr_1',
				questionId: 'q_1',
				questions: [{ header: 'Storage', question: 'Where?', options: [], multiSelect: false }]
			}
		});

		expect(deps.sliceRunRepo.setQuestion).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', questionId: 'q_1' })
		);
		expect(deps.queueRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'blocked' })
		);

		await recordExecFrame(deps, {
			...base,
			frame: { type: 'exec.done', runId: 'sr_1', commitSha: 'abc123', report: 'done' }
		});

		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', questionId: null, question: null })
		);
	});

	// The chosen failure policy: a bullet that fails ends its plan, and the queue
	// carries on with the next one rather than stalling.
	it('fails the whole plan when a bullet fails, and keeps going', async () => {
		const deps = build();

		await recordExecFrame(deps, {
			...base,
			frame: { type: 'exec.error', runId: 'sr_1', message: 'typecheck failed' }
		});

		expect(deps.sliceRunRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sr_1', status: 'failed', failureReason: 'typecheck failed' })
		);
		expect(deps.queueItemRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'qi_1', status: 'failed', failureReason: 'typecheck failed' })
		);
	});

	// A question holds the worktree until somebody answers, so the queue must stop
	// dispatching rather than start a second bullet beside the blocked one.
	it('blocks the queue on a question', async () => {
		const deps = build();

		await recordExecFrame(deps, {
			...base,
			frame: {
				type: 'exec.question',
				runId: 'sr_1',
				questionId: 'q_a',
				questions: [{ header: 'H', question: 'Which?', options: [] }]
			}
		});

		expect(deps.queueRepo.update).toHaveBeenCalledWith({ id: 'q_1', status: 'blocked' });
	});

	// The frame names a run id and nothing else, so the machine it arrived on has
	// to be checked against the queue that run belongs to.
	it('ignores a run belonging to another machine', async () => {
		const deps = build({ machineId: 'm_other' });

		await recordExecFrame(deps, {
			...base,
			frame: { type: 'exec.error', runId: 'sr_1', message: 'x' }
		});

		expect(deps.sliceRunRepo.update).not.toHaveBeenCalled();
	});
});

// A session the backend has already stopped waiting on — the machine dropped and
// the bullet was put back, or somebody re-armed it — is reporting on a row that
// now describes a different attempt.
describe('recordExecFrame, ghost session', () => {
	it('ignores a result for a bullet that is no longer running', async () => {
		const deps = build({ runStatus: 'pending' });

		await recordExecFrame(deps, {
			...base,
			frame: { type: 'exec.done', runId: 'sr_1', commitSha: 'abc123', report: 'done' }
		});

		expect(deps.sliceRunRepo.update).not.toHaveBeenCalled();
	});

	it('ignores a question from one', async () => {
		const deps = build({ runStatus: 'failed' });

		await recordExecFrame(deps, {
			...base,
			frame: {
				type: 'exec.question',
				runId: 'sr_1',
				questionId: 'qn_1',
				questions: [{ header: 'h', question: 'q', options: [], multiSelect: false }]
			}
		});

		expect(deps.sliceRunRepo.setQuestion).not.toHaveBeenCalled();
		expect(deps.queueRepo.update).not.toHaveBeenCalled();
	});
});
