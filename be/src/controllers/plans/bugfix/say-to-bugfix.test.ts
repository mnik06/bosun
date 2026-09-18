import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { sayToBugfix } from 'src/controllers/plans/bugfix/say-to-bugfix';
import { getIdService } from 'src/services/ids/id.service';
import { getMachineMemoryService } from 'src/services/sockets/machine-memory.service';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Build, type BuildStatus } from 'src/types/BuildSchema';
import { type BugfixSession } from 'src/types/BugfixSchema';
import { type Machine } from 'src/types/MachineSchema';
import { type Plan } from 'src/types/PlanSchema';

const OPEN = 1;

const PLAN: Plan = {
	id: 'p_1',
	projectId: 'prj_1',
	createdByUserId: 'u_1',
	machineId: 'm_1',
	number: 7,
	title: 'Fix the thing',
	bodyMd: 'Do it',
	status: 'approved',
	verifyInUi: true,
	auto: false,
	afk: false,
	approvedAt: new Date('2026-01-01T00:00:00.000Z'),
	repositoryId: 'repo_1',
	failureReason: null,
	input: 'fix it',
	summary: null,
	summarisedAt: null,
	createdAt: new Date('2026-01-01T00:00:00.000Z')
} as unknown as Plan;

function build(overrides: Partial<Build> & { status: BuildStatus }): Build {
	return {
		id: 'bld_1',
		planId: PLAN.id,
		repositoryId: PLAN.repositoryId,
		machineId: 'm_1',
		position: 1,
		needsYouReason: null,
		branch: 'bosun/plan/7-fix-the-thing',
		baseBranch: 'main',
		worktreePath: '/srv/worktrees/bld_1',
		portBase: 4100,
		prNumber: 42,
		prUrl: 'https://github.com/acme/repo/pull/42',
		failureReason: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		startedAt: new Date('2026-01-01T00:00:00.000Z'),
		builtAt: new Date('2026-01-01T00:00:00.000Z'),
		verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
		finishedAt: null,
		mergedAt: null,
		...overrides
	} as unknown as Build;
}

function machine(overrides: Partial<Machine> = {}): Machine {
	return {
		id: 'm_1',
		projectId: PLAN.projectId,
		name: 'vps-1',
		status: 'online',
		capabilities: [{ name: 'claude', ok: true }],
		repositoryId: PLAN.repositoryId,
		clonedRepositoryId: PLAN.repositoryId,
		verifyLanes: 1,
		buildCap: null,
		ignoreMemoryBudget: false,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides
	} as unknown as Machine;
}

function fakeSocket() {
	return { OPEN, readyState: OPEN, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

let socketRegistry: SocketRegistry;
let agentSocket: ReturnType<typeof fakeSocket>;

beforeEach(() => {
	socketRegistry = getSocketRegistry();
	agentSocket = fakeSocket();
	socketRegistry.registerAgentSocket({ machineId: 'm_1', socket: agentSocket });
});

function deps(opts: { theBuild: Build; theMachine: Machine; running: BugfixSession | null }) {
	const transition = vi.fn().mockResolvedValue({ ...opts.theBuild, status: 'fixing_bugs' });
	const start = vi.fn().mockResolvedValue({
		id: 'bfs_1',
		buildId: opts.theBuild.id,
		status: 'running',
		endedReason: null,
		startedByUserId: 'u_1',
		createdAt: new Date(),
		endedAt: null
	});
	const append = vi.fn().mockResolvedValue({
		id: 'bfm_1',
		buildId: opts.theBuild.id,
		seq: 1,
		role: 'user',
		content: { text: 'it is broken' },
		createdAt: new Date()
	});

	const lineDeps = {
		planRepo: { getOwnedById: vi.fn().mockResolvedValue(PLAN) },
		buildRepo: {
			latestForPlans: vi.fn().mockResolvedValue(new Map([[PLAN.id, opts.theBuild]])),
			transition,
			listForMachine: vi.fn().mockResolvedValue([])
		},
		machineRepo: { getOwnedById: vi.fn().mockResolvedValue(opts.theMachine) },
		onboardingRunRepo: { listActiveForMachine: vi.fn().mockResolvedValue([]) },
		quickFixRepo: { listActiveForMachine: vi.fn().mockResolvedValue([]) },
		acRepo: { listByPlan: vi.fn().mockResolvedValue([]) },
		bugfixSessionRepo: { getRunningForBuild: vi.fn().mockResolvedValue(opts.running), start },
		bugfixMessageRepo: { append },
		idService: getIdService(),
		socketRegistry,
		machineMemory: getMachineMemoryService()
	} as unknown as LineDeps;

	return { lineDeps, transition, start, append };
}

describe('sayToBugfix starting a session', () => {
	it('claims the build, records the message and sends bugfix.start', async () => {
		const theBuild = build({ status: 'in_review' });
		const { lineDeps, transition, append } = deps({ theBuild, theMachine: machine(), running: null });

		await sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_1', text: 'it is broken' });

		expect(transition).toHaveBeenCalledWith({ id: theBuild.id, from: ['in_review'], changes: { status: 'fixing_bugs' } });
		expect(append).toHaveBeenCalledWith(expect.objectContaining({ buildId: theBuild.id, role: 'user', content: { text: 'it is broken' } }));
		expect(agentSocket.send).toHaveBeenCalledWith(
			expect.stringContaining('"type":"bugfix.start"')
		);
	});

	it.each([
		['driving', build({ status: 'driving' })],
		['integrating', build({ status: 'integrating' })],
		['fixing_bugs already', build({ status: 'fixing_bugs' })]
	])('refuses when the build has another job running (%s)', async (_case, theBuild) => {
		const { lineDeps, transition } = deps({ theBuild, theMachine: machine(), running: null });

		await expect(
			sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_1', text: 'it is broken' })
		).rejects.toThrow(new HttpError(409, 'this build has another job running in its worktree'));
		expect(transition).not.toHaveBeenCalled();
	});

	it('refuses a build with no pull request yet', async () => {
		const theBuild = build({ status: 'in_review', prNumber: null });
		const { lineDeps, transition } = deps({ theBuild, theMachine: machine(), running: null });

		await expect(
			sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_1', text: 'it is broken' })
		).rejects.toThrow(new HttpError(409, 'this plan has no pull request to fix bugs on'));
		expect(transition).not.toHaveBeenCalled();
	});

	it.each([
		['merged', 'this plan has already merged'],
		['cancelled', 'this plan has been cancelled']
	] as const)('refuses a %s build', async (status, message) => {
		const theBuild = build({ status });
		const { lineDeps, transition } = deps({ theBuild, theMachine: machine(), running: null });

		await expect(
			sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_1', text: 'it is broken' })
		).rejects.toThrow(new HttpError(409, message));
		expect(transition).not.toHaveBeenCalled();
	});

	it('refuses an offline machine and claims nothing', async () => {
		const theBuild = build({ status: 'in_review' });
		socketRegistry.unregisterAgentSocket({ machineId: 'm_1', socket: agentSocket });
		const { lineDeps, transition } = deps({ theBuild, theMachine: machine(), running: null });

		await expect(
			sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_1', text: 'it is broken' })
		).rejects.toThrow(new HttpError(409, 'this machine is offline'));
		expect(transition).not.toHaveBeenCalled();
	});

	it('refuses a machine with no room for another build slot', async () => {
		const theBuild = build({ status: 'in_review' });
		const { lineDeps, transition } = deps({ theBuild, theMachine: machine({ buildCap: 0 }), running: null });

		await expect(
			sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_1', text: 'it is broken' })
		).rejects.toThrow(new HttpError(409, 'this machine has no room to run a bug-fixing session right now'));
		expect(transition).not.toHaveBeenCalled();
	});
});

describe('sayToBugfix continuing a live session', () => {
	it('sends the next turn without re-claiming the build', async () => {
		const theBuild = build({ status: 'fixing_bugs' });
		const running: BugfixSession = {
			id: 'bfs_live',
			buildId: theBuild.id,
			status: 'running',
			endedReason: null,
			startedByUserId: 'u_1',
			createdAt: new Date(),
			endedAt: null
		};
		const { lineDeps, transition, append } = deps({ theBuild, theMachine: machine(), running });

		await sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_2', text: 'also this' });

		expect(transition).not.toHaveBeenCalled();
		expect(append).toHaveBeenCalledWith(expect.objectContaining({ buildId: theBuild.id, role: 'user', content: { text: 'also this' } }));
		expect(agentSocket.send).toHaveBeenCalledWith(
			JSON.stringify({ type: 'bugfix.say', sessionId: 'bfs_live', buildId: theBuild.id, text: 'also this' })
		);
	});

	it('refuses to continue when the machine has gone offline, and writes nothing', async () => {
		const theBuild = build({ status: 'fixing_bugs' });
		const running: BugfixSession = {
			id: 'bfs_live',
			buildId: theBuild.id,
			status: 'running',
			endedReason: null,
			startedByUserId: 'u_1',
			createdAt: new Date(),
			endedAt: null
		};
		socketRegistry.unregisterAgentSocket({ machineId: 'm_1', socket: agentSocket });
		const { lineDeps, append } = deps({ theBuild, theMachine: machine(), running });

		await expect(
			sayToBugfix(lineDeps, { id: PLAN.id, projectId: PLAN.projectId, userId: 'u_2', text: 'also this' })
		).rejects.toThrow(new HttpError(409, 'this machine is offline'));
		expect(append).not.toHaveBeenCalled();
	});
});
