import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUGFIX_IDLE_TIMEOUT_MS, sweepIdleBugfixSessions } from 'src/controllers/plans/bugfix/bugfix-idle-sweep';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { getIdService } from 'src/services/ids/id.service';
import { getLineLockService } from 'src/services/line/line-lock.service';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Build, type BuildStatus } from 'src/types/BuildSchema';
import { type BugfixSession, type BugfixMessage } from 'src/types/BugfixSchema';
import { type Plan } from 'src/types/PlanSchema';

const OPEN = 1;
const NOW = new Date('2026-02-01T00:00:00.000Z');

const PLAN: Plan = { id: 'p_1', projectId: 'prj_1' } as unknown as Plan;

function build(overrides: Partial<Build> & { status: BuildStatus }): Build {
	return { id: 'bld_1', planId: PLAN.id, machineId: 'm_1', ...overrides } as unknown as Build;
}

function session(overrides: Partial<BugfixSession> = {}): BugfixSession {
	return {
		id: 'bfs_live',
		buildId: 'bld_1',
		status: 'running',
		endedReason: null,
		startedByUserId: 'u_1',
		createdAt: new Date(NOW.getTime() - BUGFIX_IDLE_TIMEOUT_MS - 1),
		endedAt: null,
		...overrides
	};
}

function fakeSocket() {
	return { OPEN, readyState: OPEN, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

function message(createdAt: Date): BugfixMessage {
	return { id: 'bfm_1', buildId: 'bld_1', seq: 1, role: 'user', content: { text: 'x' }, createdAt };
}

let socketRegistry: SocketRegistry;
let agentSocket: ReturnType<typeof fakeSocket>;

beforeEach(() => {
	socketRegistry = getSocketRegistry();
	agentSocket = fakeSocket();
	socketRegistry.registerAgentSocket({ machineId: 'm_1', socket: agentSocket });
});

function deps(opts: { running: BugfixSession[]; latestMessage: BugfixMessage | null; theBuild: Build | null }) {
	const close = vi.fn().mockImplementation((args: { endedReason: string }) => Promise.resolve({ ...opts.running[0], status: 'closed', endedReason: args.endedReason }));
	const transition = vi.fn().mockImplementation((args: { changes: { status: BuildStatus } }) =>
		Promise.resolve(opts.theBuild ? { ...opts.theBuild, status: args.changes.status } : null)
	);
	const append = vi.fn().mockResolvedValue({ id: 'bfm_2', buildId: 'bld_1', seq: 2, role: 'system', content: { text: 'ended' }, createdAt: NOW });

	const lineDeps = {
		bugfixSessionRepo: { listRunning: vi.fn().mockResolvedValue(opts.running), getRunningForBuild: vi.fn().mockResolvedValue(opts.running[0] ?? null), close },
		bugfixMessageRepo: { latestForBuild: vi.fn().mockResolvedValue(opts.latestMessage), append },
		buildRepo: { getById: vi.fn().mockResolvedValue(opts.theBuild), transition },
		machineRepo: { getById: vi.fn().mockResolvedValue(null) },
		planRepo: { getById: vi.fn().mockResolvedValue(PLAN) },
		planBugRepo: { failUnresolved: vi.fn().mockResolvedValue([]) },
		sliceRunRepo: { listForBuild: vi.fn().mockResolvedValue([]) },
		integrationRepo: { listForBuild: vi.fn().mockResolvedValue([]) },
		idService: getIdService(),
		socketRegistry,
		lineLock: getLineLockService()
	} as unknown as LineDeps;

	return { lineDeps, close, transition, append };
}

describe('bugfix idle sweep', () => {
	it('ends a session with no activity since past the timeout and reverts the build', async () => {
		const theBuild = build({ status: 'fixing_bugs' });
		const { lineDeps, close, transition } = deps({ running: [session()], latestMessage: null, theBuild });

		await sweepIdleBugfixSessions(lineDeps, { now: NOW });

		expect(close).toHaveBeenCalledWith({ id: 'bfs_live', endedReason: 'idle_timeout' });
		expect(transition).toHaveBeenCalledWith({ id: 'bld_1', from: ['fixing_bugs'], changes: { status: expect.any(String), needsYouReason: null } });
		expect(agentSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'bugfix.cancel', sessionId: 'bfs_live', buildId: 'bld_1' }));
	});

	it('leaves a session alone whose last message is recent', async () => {
		const theBuild = build({ status: 'fixing_bugs' });
		const { lineDeps, close } = deps({
			running: [session()],
			latestMessage: message(new Date(NOW.getTime() - 1000)),
			theBuild
		});

		await sweepIdleBugfixSessions(lineDeps, { now: NOW });

		expect(close).not.toHaveBeenCalled();
	});

	it('does nothing when the build already moved past fixing_bugs before the sweep reached it', async () => {
		const theBuild = build({ status: 'in_review' });
		const { lineDeps, close } = deps({ running: [session()], latestMessage: null, theBuild });

		await sweepIdleBugfixSessions(lineDeps, { now: NOW });

		expect(close).not.toHaveBeenCalled();
	});
});
