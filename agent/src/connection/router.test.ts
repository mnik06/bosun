import { describe, expect, it, vi } from 'vitest';
import { parseServerFrame, routeServerFrame, type AgentState, type RouterDeps } from './router';
import { type PlanningSessions } from '../planning/session';
import { type ServerMsg } from '../protocol';
import { type Services } from '../services/index';

function build (opts?: { paused?: boolean }) {
	const send = vi.fn();
	const announce = vi.fn().mockResolvedValue(undefined);
	const onUpgrade = vi.fn().mockResolvedValue(undefined);
	const terminateSelf = vi.fn().mockResolvedValue(undefined);
	const sessions = {
		start: vi.fn().mockResolvedValue(undefined),
		answer: vi.fn(),
		cancel: vi.fn(),
		cancelAll: vi.fn(),
		running: vi.fn().mockReturnValue(0)
	};
	const state: AgentState = { paused: opts?.paused ?? false };

	const deps = {
		socket: { send } as unknown as RouterDeps['socket'],
		services: { teardown: { terminateSelf } } as unknown as Services,
		configPath: '/home/u/.bosun/config.json',
		state,
		sessions: sessions as unknown as PlanningSessions,
		announce,
		onUpgrade
	} satisfies RouterDeps;

	return {
		announce,
		onUpgrade,
		send,
		sessions,
		state,
		terminateSelf,
		route: async (msg: ServerMsg) => routeServerFrame(deps, msg)
	};
}

function sent (send: ReturnType<typeof vi.fn>): unknown[] {
	return send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
}

describe('routeServerFrame', () => {
	// The whole point of refresh: it re-announces, which is what re-reports the
	// agent version and re-reads the env file, the MCP config and the skills dirs.
	// An earlier version answered refresh with preflight alone, so a machine's
	// reported version could never change without a reconnect.
	it('answers refresh by re-announcing, not by sending preflight alone', async () => {
		const { announce, route } = build();

		await route({ type: 'refresh' });

		expect(announce).toHaveBeenCalledWith('refresh');
	});

	it('passes an upgrade offer through to the installer', async () => {
		const { onUpgrade, route } = build();

		await route({ type: 'upgrade', version: '2.1.0', downloadBaseUrl: 'https://d/agent-v2.1.0' });

		expect(onUpgrade).toHaveBeenCalledWith({
			version: '2.1.0',
			downloadBaseUrl: 'https://d/agent-v2.1.0'
		});
	});

	it('answers ping with a pong carrying the same id', async () => {
		const { send, route } = build();

		await route({ type: 'ping', id: 'cmd_1' });

		expect(sent(send)).toEqual([expect.objectContaining({ type: 'pong', id: 'cmd_1' })]);
	});

	it.each([
		['pause', true],
		['resume', false]
	] as const)('%s sets paused to %s', async (type, paused) => {
		const { state, route } = build({ paused: !paused });

		await route({ type });

		expect(state.paused).toBe(paused);
	});

	// Pause is only worth anything if every dispatch path consults it.
	it('refuses to start a plan while paused, and tells the backend why', async () => {
		const { send, sessions, route } = build({ paused: true });

		await route({ type: 'plan.start', planId: 'p_1', input: 'go' });

		expect(sessions.start).not.toHaveBeenCalled();
		expect(sent(send)).toEqual([
			expect.objectContaining({ type: 'plan.error', planId: 'p_1', message: 'this machine is paused' })
		]);
	});

	it('starts a plan when not paused', async () => {
		const { sessions, route } = build();

		await route({ type: 'plan.start', planId: 'p_1', input: 'go' });

		expect(sessions.start).toHaveBeenCalledWith({ planId: 'p_1', input: 'go' });
	});

	it('routes an answer and a cancel to the session', async () => {
		const { sessions, route } = build();

		await route({ type: 'plan.answer', planId: 'p_1', questionId: 'q_1', answers: [{ selected: ['a'] }] });
		await route({ type: 'plan.cancel', planId: 'p_2' });

		expect(sessions.answer).toHaveBeenCalledWith(
			expect.objectContaining({ planId: 'p_1', questionId: 'q_1' })
		);
		expect(sessions.cancel).toHaveBeenCalledWith('p_2');
	});

	// Terminal, and it has to reap sessions first: the process group outlives the
	// unit otherwise.
	it('cancels every session before terminating on shutdown', async () => {
		const { sessions, terminateSelf, route } = build();

		await route({ type: 'shutdown', reason: 'deleted in bosun' });

		expect(sessions.cancelAll).toHaveBeenCalledOnce();
		expect(terminateSelf).toHaveBeenCalledWith({
			configPath: '/home/u/.bosun/config.json',
			reason: 'deleted in bosun'
		});
	});

	// A frame type that reaches no case must do nothing at all. The switch replaced
	// an if-chain whose last branch was `shutdown`, so every new type terminated
	// the agent until somebody remembered to add a case.
	it('does nothing for a frame it has no case for', async () => {
		const { send, sessions, terminateSelf, route } = build();

		await route({ type: 'not-a-real-frame' } as unknown as ServerMsg);

		expect(send).not.toHaveBeenCalled();
		expect(terminateSelf).not.toHaveBeenCalled();
		expect(sessions.cancelAll).not.toHaveBeenCalled();
	});
});

describe('parseServerFrame', () => {
	it('reads a valid frame', () => {
		expect(parseServerFrame('{"type":"refresh"}')).toEqual({ type: 'refresh' });
	});

	// Anything arriving over a socket is validated the same way an HTTP body is:
	// a frame that fails is logged and dropped, never partially acted on.
	it.each([
		['not json'],
		['{"type":"nope"}'],
		['{"type":"ping"}'],
		['[]']
	])('drops %j', (raw) => {
		expect(parseServerFrame(raw)).toBeNull();
	});
});
