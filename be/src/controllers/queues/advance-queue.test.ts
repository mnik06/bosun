import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	advanceQueue,
	MAX_RUNNING_PER_MACHINE,
	type AdvanceDeps
} from 'src/controllers/queues/advance-queue';
import { type Queue, type QueueItem, type SliceRun } from 'src/types/QueueSchema';

function queue(overrides: Partial<Queue> = {}): Queue {
	return {
		id: 'q_1',
		userId: 'u_1',
		machineId: 'm_1',
		name: 'Auth',
		slug: 'auth',
		worktreePath: '/home/u/.bosun/worktrees/auth',
		baseRef: 'main',
		afk: false,
		status: 'idle',
		failureReason: null,
		createdAt: new Date(),
		...overrides
	};
}

function item(overrides: Partial<QueueItem> = {}): QueueItem {
	return {
		id: 'qi_1',
		queueId: 'q_1',
		planId: 'p_1',
		ordinal: 1,
		branch: null,
		status: 'queued',
		prUrl: null,
		failureReason: null,
		startedAt: null,
		finishedAt: null,
		...overrides
	};
}

function run(overrides: Partial<SliceRun> = {}): SliceRun {
	return {
		id: 'sr_1',
		queueItemId: 'qi_1',
		sliceId: 'sl_1',
		ordinal: 1,
		status: 'running',
		commitSha: null,
		failureReason: null,
		startedAt: null,
		finishedAt: null,
		...overrides
	};
}

function build(opts: {
	queue?: Queue;
	items?: QueueItem[];
	claimItem?: QueueItem | null;
	claimRun?: SliceRun | null;
	runs?: SliceRun[];
	busy?: number;
}) {
	const sendToAgent = vi.fn();

	const deps = {
		queueRepo: {
			getById: vi.fn().mockResolvedValue(opts.queue ?? queue()),
			update: vi.fn().mockImplementation(async (o) => ({ ...queue(), ...o })),
			countRunningForMachine: vi.fn().mockResolvedValue(opts.busy ?? 0),
			listRunnableForMachine: vi.fn().mockResolvedValue([])
		},
		queueItemRepo: {
			listForQueue: vi.fn().mockResolvedValue(opts.items ?? []),
			claimNext: vi.fn().mockResolvedValue(opts.claimItem ?? null),
			update: vi.fn().mockResolvedValue(item())
		},
		sliceRunRepo: {
			claimNext: vi.fn().mockResolvedValue(opts.claimRun ?? null),
			listForItem: vi.fn().mockResolvedValue(opts.runs ?? []),
			update: vi.fn()
		},
		planRepo: {
			getByIdForMachine: vi
				.fn()
				.mockResolvedValue({ id: 'p_1', title: 'Auth', bodyMd: 'body', machineId: 'm_1' })
		},
		sliceRepo: {
			listByPlan: vi.fn().mockResolvedValue([
				{ id: 'sl_1', planId: 'p_1', ordinal: 1, kind: 'build', title: 'one', bodyMd: null },
				{ id: 'sl_2', planId: 'p_1', ordinal: 2, kind: 'verify', title: 'two', bodyMd: null }
			])
		},
		acRepo: { listBySlice: vi.fn().mockResolvedValue([]) },
		socketRegistry: { sendToAgent, broadcastToUi: vi.fn() }
	} as unknown as AdvanceDeps;

	return { deps, sendToAgent };
}

function dispatched(sendToAgent: ReturnType<typeof vi.fn>) {
	return sendToAgent.mock.calls.at(-1)?.[0].message;
}

describe('advanceQueue', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('dispatches the first bullet of a newly claimed plan on a branch of its own', async () => {
		const { deps, sendToAgent } = build({
			claimItem: item(),
			claimRun: run(),
			runs: [run(), run({ id: 'sr_2', sliceId: 'sl_2', ordinal: 2, status: 'pending' })]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(dispatched(sendToAgent)).toMatchObject({
			type: 'exec.start',
			runId: 'sr_1',
			branch: 'bosun/auth/p_1',
			baseRef: 'main',
			freshBranch: true
		});
	});

	// The second bullet resetting to baseRef would throw away the commit the first
	// one made, which is the whole history the plan's pull request is going to be.
	it('does not cut the branch again for a later bullet', async () => {
		const first = run({ status: 'done' });
		const second = run({ id: 'sr_2', sliceId: 'sl_2', ordinal: 2 });
		const { deps, sendToAgent } = build({
			items: [item({ status: 'running', branch: 'bosun/auth/p_1' })],
			claimRun: second,
			runs: [first, second]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(dispatched(sendToAgent)).toMatchObject({ runId: 'sr_2', freshBranch: false });
	});

	it('tells a later bullet what the earlier ones did', async () => {
		const first = run({ status: 'done' });
		const second = run({ id: 'sr_2', sliceId: 'sl_2', ordinal: 2 });
		const { deps, sendToAgent } = build({
			items: [item({ status: 'running' })],
			claimRun: second,
			runs: [first, second]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(dispatched(sendToAgent).doneSlices).toEqual([{ ordinal: 1, title: 'one' }]);
	});

	it('carries the queue AFK flag into the run', async () => {
		const { deps, sendToAgent } = build({
			queue: queue({ afk: true }),
			claimItem: item(),
			claimRun: run(),
			runs: [run()]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(dispatched(sendToAgent).afk).toBe(true);
	});

	it('goes idle when there is nothing left to run', async () => {
		const { deps, sendToAgent } = build({ queue: queue({ status: 'running' }) });

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(sendToAgent).not.toHaveBeenCalled();
		expect(deps.queueRepo.update).toHaveBeenCalledWith({ id: 'q_1', status: 'idle' });
	});

	// Every one of these means a run is either outstanding or deliberately stopped.
	// Dispatching anyway would put two sessions in one worktree.
	it.each(['paused', 'blocked', 'stopped', 'failed', 'provisioning'] as const)(
		'dispatches nothing while %s',
		async (status) => {
			const { deps, sendToAgent } = build({
				queue: queue({ status }),
				claimItem: item(),
				claimRun: run()
			});

			await advanceQueue(deps, { queueId: 'q_1' });

			expect(sendToAgent).not.toHaveBeenCalled();
		}
	);

	// Each running queue is a claude process in a worktree of its own; five of
	// them is how a small box dies.
	it('dispatches nothing when the machine is already at its cap', async () => {
		const { deps, sendToAgent } = build({
			busy: MAX_RUNNING_PER_MACHINE,
			claimItem: item(),
			claimRun: run(),
			runs: [run()]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(sendToAgent).not.toHaveBeenCalled();
	});

	// The cap gates starting a queue, not continuing one that already holds a
	// worktree — otherwise a queue would stall halfway through its own plan.
	it('lets a queue that is already running finish its plan at the cap', async () => {
		const { deps, sendToAgent } = build({
			queue: queue({ status: 'running' }),
			busy: MAX_RUNNING_PER_MACHINE,
			items: [item({ status: 'running' })],
			claimRun: run(),
			runs: [run()]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(sendToAgent).toHaveBeenCalled();
	});

	it('dispatches nothing before the worktree exists', async () => {
		const { deps, sendToAgent } = build({
			queue: queue({ worktreePath: null }),
			claimItem: item(),
			claimRun: run()
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(sendToAgent).not.toHaveBeenCalled();
	});

	// A pull request in front of reviewers implies the work is finished. Opening
	// one for a plan whose bullets did not all land says something untrue.
	it('does not publish a plan whose bullets did not all land', async () => {
		const { deps, sendToAgent } = build({
			queue: queue({ status: 'running' }),
			items: [item({ status: 'running', branch: 'bosun/auth/p_1' })],
			claimRun: null,
			runs: [
				run({ status: 'done', commitSha: 'abc' }),
				run({ id: 'sr_2', ordinal: 2, status: 'failed' })
			]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(sendToAgent).not.toHaveBeenCalled();
	});

	it('publishes a plan whose bullets all landed', async () => {
		const { deps, sendToAgent } = build({
			queue: queue({ status: 'running' }),
			items: [item({ status: 'running', branch: 'bosun/auth/p_1' })],
			claimRun: null,
			runs: [run({ status: 'done', commitSha: 'abc' })]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(sendToAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.objectContaining({
					type: 'queue.publish',
					branch: 'bosun/auth/p_1',
					baseRef: 'main'
				})
			})
		);
	});

	// Every bullet passed and none of them changed a file — a verify-only plan, or
	// work that was already present. There is no branch to push.
	it('publishes nothing when no bullet made a commit', async () => {
		const { deps, sendToAgent } = build({
			queue: queue({ status: 'running' }),
			items: [item({ status: 'running', branch: 'bosun/auth/p_1' })],
			claimRun: null,
			runs: [run({ status: 'done', commitSha: null })]
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(sendToAgent).not.toHaveBeenCalled();
	});

	it('closes a running item once its bullets are all settled', async () => {
		const { deps } = build({
			queue: queue({ status: 'running' }),
			items: [item({ status: 'running' })],
			claimRun: null
		});

		await advanceQueue(deps, { queueId: 'q_1' });

		expect(deps.queueItemRepo.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'qi_1', status: 'done' })
		);
	});
});
