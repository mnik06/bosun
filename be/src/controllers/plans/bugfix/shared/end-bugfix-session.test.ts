import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endRunningBugfixSession } from 'src/controllers/plans/bugfix/shared/end-bugfix-session';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { getIdService } from 'src/services/ids/id.service';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type BugfixSession } from 'src/types/BugfixSchema';

const OPEN = 1;

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

function deps(opts: { closeReturns: BugfixSession | null }) {
	const close = vi.fn().mockResolvedValue(opts.closeReturns);
	const failUnresolved = vi.fn().mockResolvedValue([]);
	const append = vi.fn().mockResolvedValue({
		id: 'bfm_1',
		buildId: 'bld_1',
		seq: 1,
		role: 'system',
		content: { text: 'placeholder' },
		createdAt: new Date()
	});

	const lineDeps = {
		bugfixSessionRepo: { close },
		planBugRepo: { failUnresolved },
		bugfixMessageRepo: { append },
		idService: getIdService(),
		socketRegistry
	} as unknown as LineDeps;

	return { lineDeps, close, failUnresolved, append };
}

describe('endRunningBugfixSession', () => {
	it.each(['merged', 'cancelled', 'idle_timeout', 'error'] as const)(
		'closes the row, fails unresolved bugs, posts a system message and cancels the agent — %s',
		async (endedReason) => {
			const { lineDeps, close, failUnresolved, append } = deps({ closeReturns: { ...RUNNING_SESSION, status: 'closed', endedReason } });

			const result = await endRunningBugfixSession(lineDeps, {
				buildId: 'bld_1',
				planId: 'p_1',
				machineId: 'm_1',
				session: RUNNING_SESSION,
				endedReason
			});

			expect(close).toHaveBeenCalledWith({ id: 'bfs_live', endedReason });
			expect(failUnresolved).toHaveBeenCalledWith({ buildId: 'bld_1', note: expect.any(String) });
			expect(append).toHaveBeenCalledWith(expect.objectContaining({ buildId: 'bld_1', role: 'system' }));
			expect(agentSocket.send).toHaveBeenCalledWith(
				JSON.stringify({ type: 'bugfix.cancel', sessionId: 'bfs_live', buildId: 'bld_1' })
			);
			expect(result?.endedReason).toBe(endedReason);
		}
	);

	it('leaves bugs alone and posts no system message on a person\'s own "Done"', async () => {
		const { lineDeps, failUnresolved, append } = deps({ closeReturns: { ...RUNNING_SESSION, status: 'closed', endedReason: 'user_closed' } });

		await endRunningBugfixSession(lineDeps, {
			buildId: 'bld_1',
			planId: 'p_1',
			machineId: 'm_1',
			session: RUNNING_SESSION,
			endedReason: 'user_closed'
		});

		expect(failUnresolved).not.toHaveBeenCalled();
		expect(append).not.toHaveBeenCalled();
	});

	it('does nothing further when the row was already closed by another caller', async () => {
		const { lineDeps, failUnresolved, append } = deps({ closeReturns: null });

		const result = await endRunningBugfixSession(lineDeps, {
			buildId: 'bld_1',
			planId: 'p_1',
			machineId: 'm_1',
			session: RUNNING_SESSION,
			endedReason: 'cancelled'
		});

		expect(result).toBeNull();
		expect(failUnresolved).not.toHaveBeenCalled();
		expect(append).not.toHaveBeenCalled();
		expect(agentSocket.send).not.toHaveBeenCalled();
	});

	it('sends nothing to the agent when the build has none', async () => {
		const { lineDeps } = deps({ closeReturns: { ...RUNNING_SESSION, status: 'closed', endedReason: 'cancelled' } });

		await endRunningBugfixSession(lineDeps, {
			buildId: 'bld_1',
			planId: 'p_1',
			machineId: null,
			session: RUNNING_SESSION,
			endedReason: 'cancelled'
		});

		expect(agentSocket.send).not.toHaveBeenCalled();
	});
});
