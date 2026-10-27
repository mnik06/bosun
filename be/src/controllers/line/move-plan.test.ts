import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { movePlan } from 'src/controllers/line/move-plan';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { type Build } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';

vi.mock('src/controllers/line/schedule', () => ({ scheduleMachine: vi.fn() }));

const updatePlan = vi.fn();
const updateBuild = vi.fn();

vi.mock('src/repos/plans/plan.repo', () => ({ getPlanRepo: () => ({ update: updatePlan }) }));
vi.mock('src/repos/builds/build.repo', () => ({ getBuildRepo: () => ({ update: updateBuild }) }));

const PLAN = { id: 'p_1', projectId: 'prj_1', machineId: 'm_old', repositoryId: 'repo_1', status: 'ready' } as unknown as Plan;

function setup(opts: { plan?: Partial<Plan>; build?: Partial<Build> | null; machineRepositoryId?: string | null }) {
	const plan = { ...PLAN, ...opts.plan };
	const build = opts.build === null || opts.build === undefined ? null : ({ id: 'bld_1', machineId: 'm_old', portBase: 4100, worktreePath: null, status: 'scheduled', ...opts.build } as Build);

	updatePlan.mockResolvedValue({ ...plan, machineId: 'm_new' });
	updateBuild.mockImplementation(async (changes: Partial<Build>) => ({ ...build, ...changes }));

	return {
		planRepo: { getOwnedById: vi.fn().mockResolvedValue(plan) },
		machineRepo: {
			getOwnedById: vi.fn().mockResolvedValue({ id: 'm_new', repositoryId: opts.machineRepositoryId === undefined ? 'repo_1' : opts.machineRepositoryId })
		},
		buildRepo: { liveForPlan: vi.fn().mockResolvedValue(build) },
		socketRegistry: { broadcastToUi: vi.fn() },
		db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) }
	} as unknown as LineDeps;
}

const MOVE = { id: 'p_1', projectId: 'prj_1', machineId: 'm_new' };

describe('movePlan', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('moves a scheduled plan that has not started, freeing its build to be taken by the new machine', async () => {
		const moved = await movePlan(setup({ build: {} }), MOVE);

		expect(moved.machineId).toBe('m_new');
		expect(updatePlan).toHaveBeenCalledWith({ id: 'p_1', machineId: 'm_new' });
		expect(updateBuild).toHaveBeenCalledWith({ id: 'bld_1', machineId: null, portBase: null });
		expect(scheduleMachine).toHaveBeenCalledWith(expect.anything(), { machineId: 'm_new' });
	});

	it('moves a written plan not yet in the line', async () => {
		await movePlan(setup({ build: null }), MOVE);

		expect(updatePlan).toHaveBeenCalled();
		expect(updateBuild).not.toHaveBeenCalled();
	});

	it('moves a plan whose worktree could not be made', async () => {
		await movePlan(setup({ build: { status: 'needs_you', machineId: 'm_old' } }), MOVE);

		expect(updateBuild).toHaveBeenCalled();
	});

	it.each([
		['a plan still being planned', { plan: { status: 'planning' as const } }],
		['a plan with a worktree on its machine', { build: { status: 'scheduled' as const, worktreePath: '/w' } }],
		['a plan building', { build: { status: 'building' as const } }],
		['to a machine on another repository', { build: {}, machineRepositoryId: 'repo_2' }],
		['to a machine with no repository', { build: {}, machineRepositoryId: null }]
	])('refuses %s', async (_, opts) => {
		await expect(movePlan(setup(opts), MOVE)).rejects.toMatchObject({ statusCode: 409 });
		expect(updatePlan).not.toHaveBeenCalled();
		expect(scheduleMachine).not.toHaveBeenCalled();
	});
});
