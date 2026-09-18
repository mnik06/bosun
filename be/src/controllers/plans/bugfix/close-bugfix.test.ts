import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { closeBugfixSession } from 'src/controllers/plans/bugfix/close-bugfix';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { getLineLockService } from 'src/services/line/line-lock.service';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Build, type BuildStatus, type Integration, type SliceRun } from 'src/types/BuildSchema';
import { type BugfixSession } from 'src/types/BugfixSchema';
import { type Plan } from 'src/types/PlanSchema';

const OPEN = 1;

const PLAN: Plan = {
	id: 'p_1',
	projectId: 'prj_1',
	machineId: 'm_1',
	number: 7,
	title: 'Fix the thing',
	repositoryId: 'repo_1'
} as unknown as Plan;

function build(overrides: Partial<Build> & { status: BuildStatus }): Build {
	return {
		id: 'bld_1',
		planId: PLAN.id,
		repositoryId: PLAN.repositoryId,
		machineId: 'm_1',
		builtAt: new Date('2026-01-01T00:00:00.000Z'),
		verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides
	} as unknown as Build;
}

const RUNNING_SESSION: BugfixSession = {
	id: 'bfs_live',
	buildId: 'bld_1',
	status: 'running',
	endedReason: null,
	startedByUserId: 'u_1',
	createdAt: new Date(),
	endedAt: null
};

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

function deps(opts: { liveBuild: Build | null; running: BugfixSession | null; runs?: SliceRun[]; integrations?: Integration[] }) {
	const close = vi.fn().mockResolvedValue(opts.running ? { ...opts.running, status: 'closed', endedReason: 'user_closed' } : null);
	const transition = vi.fn().mockImplementation((args: { changes: { status: BuildStatus } }) =>
		Promise.resolve(opts.liveBuild ? { ...opts.liveBuild, status: args.changes.status } : null)
	);

	const lineDeps = {
		planRepo: { getOwnedById: vi.fn().mockResolvedValue(PLAN) },
		buildRepo: { liveForPlan: vi.fn().mockResolvedValue(opts.liveBuild), transition },
		bugfixSessionRepo: { getRunningForBuild: vi.fn().mockResolvedValue(opts.running), close },
		sliceRunRepo: { listForBuild: vi.fn().mockResolvedValue(opts.runs ?? []) },
		integrationRepo: { listForBuild: vi.fn().mockResolvedValue(opts.integrations ?? []) },
		machineRepo: { getById: vi.fn().mockResolvedValue(null) },
		socketRegistry,
		lineLock: getLineLockService()
	} as unknown as LineDeps;

	return { lineDeps, transition, close };
}

describe('closeBugfixSession', () => {
	it('refuses when there is no live session to end', async () => {
		const { lineDeps, transition } = deps({ liveBuild: null, running: null });

		await expect(closeBugfixSession(lineDeps, { id: PLAN.id, projectId: PLAN.projectId })).rejects.toThrow(
			new HttpError(409, 'there is no live bug-fixing session to end')
		);
		expect(transition).not.toHaveBeenCalled();
	});

	it('ends the session and reverts the build to in_review when nothing else is pending', async () => {
		const liveBuild = build({ status: 'fixing_bugs' });
		const { lineDeps, transition, close } = deps({ liveBuild, running: RUNNING_SESSION });

		await closeBugfixSession(lineDeps, { id: PLAN.id, projectId: PLAN.projectId });

		expect(close).toHaveBeenCalledWith({ id: RUNNING_SESSION.id, endedReason: 'user_closed' });
		expect(transition).toHaveBeenCalledWith({
			id: liveBuild.id,
			from: ['fixing_bugs'],
			changes: { status: 'in_review', needsYouReason: null }
		});
		expect(agentSocket.send).toHaveBeenCalledWith(
			JSON.stringify({ type: 'bugfix.cancel', sessionId: RUNNING_SESSION.id, buildId: liveBuild.id })
		);
	});

	it('resumes a pending integration that queued while the session ran', async () => {
		const liveBuild = build({ status: 'fixing_bugs' });
		const integrations: Integration[] = [
			{
				id: 'int_1',
				buildId: liveBuild.id,
				trigger: 'base_moved',
				onto: 'main',
				ontoSha: null,
				status: 'pending',
				merged: false,
				regenerated: [],
				resolved: [],
				checks: null,
				detail: null,
				createdAt: new Date(),
				startedAt: null,
				finishedAt: null
			}
		];
		const { lineDeps, transition } = deps({ liveBuild, running: RUNNING_SESSION, integrations });

		await closeBugfixSession(lineDeps, { id: PLAN.id, projectId: PLAN.projectId });

		expect(transition).toHaveBeenCalledWith({
			id: liveBuild.id,
			from: ['fixing_bugs'],
			changes: { status: 'waiting_verify', needsYouReason: null }
		});
	});

	it('refuses a second close once the session is already closed', async () => {
		const liveBuild = build({ status: 'fixing_bugs' });
		const { lineDeps, transition } = deps({ liveBuild, running: null });

		await expect(closeBugfixSession(lineDeps, { id: PLAN.id, projectId: PLAN.projectId })).rejects.toThrow(
			new HttpError(409, 'there is no live bug-fixing session to end')
		);
		expect(transition).not.toHaveBeenCalled();
	});
});
