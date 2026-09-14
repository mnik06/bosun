import { describe, expect, it, vi } from 'vitest';
import { parseServerFrame, routeServerFrame, type AgentState, type RouterDeps } from './router';
import { type SummarySessions } from '../summary/session';
import { type AskSessions } from '../ask/session';
import { type ExecutionSessions } from '../execution/session';
import { type IntegrationSessions } from '../integration/session';
import { type OnboardingSessions } from '../onboarding/session';
import { type PlanningSessions } from '../planning/session';
import { type ServerMsg } from '../protocol';
import { DEFAULT_PROJECT_PROFILE } from '../project-profile';
import { type Services } from '../services/index';

const SEALED = { v: 1 as const, wrappedKey: 'd3JhcHBlZA==', iv: 'aXY=', ciphertext: 'Y2lwaGVy' };

const CONFIG_WITH_SETUP = 'version: 1\nsetup:\n  - name: install\n    run: pnpm i\n';

function build (opts?: { paused?: boolean; repositoryId?: string | null }) {
	const send = vi.fn();
	const sink = vi.fn();
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
	const executions = {
		start: vi.fn().mockResolvedValue(undefined),
		answer: vi.fn(),
		cancel: vi.fn(),
		cancelAll: vi.fn(),
		running: vi.fn().mockReturnValue(0)
	};
	const integrations = {
		start: vi.fn().mockResolvedValue(undefined),
		cancel: vi.fn(),
		cancelAll: vi.fn()
	};
	const onboarding = {
		start: vi.fn().mockResolvedValue(undefined),
		cancel: vi.fn(),
		cancelAll: vi.fn()
	};
	const summaries = {
		start: vi.fn().mockResolvedValue(undefined),
		cancelAll: vi.fn()
	};
	const asks = {
		ask: vi.fn().mockResolvedValue(undefined),
		cancelAll: vi.fn(),
		running: vi.fn().mockReturnValue(0)
	};
	const state: AgentState = { paused: opts?.paused ?? false };
	const projectEnv = {
		set: vi.fn(),
		delete: vi.fn(),
		setSecrets: vi.fn(),
		secretNames: vi.fn().mockReturnValue([]),
		secretValues: vi.fn().mockReturnValue({}),
		applyTo: vi.fn().mockReturnValue({ written: ['be/.env'], skipped: [] })
	};
	const worktree = {
		ensure: vi.fn().mockResolvedValue({ ok: true, worktreePath: '/nonexistent-worktree', baseRef: 'origin/main', detail: 'created' }),
		remove: vi.fn().mockResolvedValue(undefined)
	};
	const commit = {
		startBuildBranch: vi.fn().mockResolvedValue({ ok: true, detail: 'bosun/plan/1-auth from origin/main' })
	};
	const setupSteps = {
		runAll: vi.fn().mockResolvedValue({ ok: true, ran: ['install'] }),
		rerunChanged: vi.fn().mockResolvedValue({ ok: true, ran: [] }),
		forget: vi.fn()
	};
	const exec = { run: vi.fn().mockResolvedValue({ ok: true, stdout: 'abc123', stderr: '', reason: '' }) };
	const inputsKey = { open: vi.fn().mockReturnValue('postgres://opened') };
	const workspace = { repositoryId: vi.fn().mockReturnValue(opts?.repositoryId === undefined ? 'repo_1' : opts.repositoryId) };
	const claudeAuth = { sessionEnv: vi.fn().mockReturnValue({}) };

	const deps = {
		socket: { send } as unknown as RouterDeps['socket'],
		services: {
			teardown: { terminateSelf },
			stack: { downAll: vi.fn().mockResolvedValue(undefined) },
			projectEnv,
			worktree,
			commit,
			setupSteps,
			exec,
			inputsKey,
			workspace,
			claudeAuth
		} as unknown as Services,
		configPath: '/home/u/.bosun/config.json',
		state,
		sessions: sessions as unknown as PlanningSessions,
		executions: executions as unknown as ExecutionSessions,
		integrations: integrations as unknown as IntegrationSessions,
		onboarding: onboarding as unknown as OnboardingSessions,
		summaries: summaries as unknown as SummarySessions,
		asks: asks as unknown as AskSessions,
		sink,
		announce,
		onUpgrade
	} satisfies RouterDeps;

	return {
		announce,
		asks,
		commit,
		executions,
		inputsKey,
		integrations,
		onUpgrade,
		onboarding,
		projectEnv,
		send,
		sessions,
		setupSteps,
		sink,
		state,
		summaries,
		terminateSelf,
		worktree,
		route: async (msg: ServerMsg) => routeServerFrame(deps, msg)
	};
}

function sent (send: ReturnType<typeof vi.fn>): unknown[] {
	return send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
}

describe('routeServerFrame', () => {
	// The whole point of refresh: it re-announces, which is what re-reports the
	// agent version and re-reads the env file, the MCP config and the skills dirs.
	it('answers refresh by re-announcing, not by sending preflight alone', async () => {
		const { announce, route } = build();

		await route({ type: 'refresh' });

		expect(announce).toHaveBeenCalledWith('refresh');
	});

	it('passes an upgrade offer through to the installer', async () => {
		const { onUpgrade, route } = build();

		await route({ type: 'upgrade', force: false, version: '2.1.0', downloadBaseUrl: 'https://d/agent-v2.1.0' });

		expect(onUpgrade).toHaveBeenCalledWith({
			version: '2.1.0',
			downloadBaseUrl: 'https://d/agent-v2.1.0',
			force: false
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

		await route({ type: 'plan.start', verifyInUi: true, handsOff: false, notes: null, configDraft: null, planId: 'p_1', input: 'go' });

		expect(sessions.start).not.toHaveBeenCalled();
		expect(sent(send)).toEqual([
			expect.objectContaining({ type: 'plan.error', planId: 'p_1', message: 'this machine is paused' })
		]);
	});

	it('starts a plan when not paused', async () => {
		const { sessions, route } = build();

		await route({ type: 'plan.start', verifyInUi: true, handsOff: true, notes: null, configDraft: 'version: 1', planId: 'p_1', input: 'go' });

		expect(sessions.start).toHaveBeenCalledWith({
			planId: 'p_1',
			input: 'go',
			verifyInUi: true,
			handsOff: true,
			notes: null,
			configDraft: 'version: 1'
		});
	});

	it('refuses onboarding while paused, and says so', async () => {
		const { send, onboarding, route } = build({ paused: true });

		await route({ type: 'onboarding.start', runId: 'onb_1', phase: 'discover', portBase: 3900, configDraft: null, preferDraft: false, applyMigrations: true, memoryMaxBytes: null });

		expect(onboarding.start).not.toHaveBeenCalled();
		expect(sent(send)).toEqual([{ type: 'onboarding.error', runId: 'onb_1', message: 'this machine is paused' }]);
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
		const { sessions, executions, integrations, onboarding, asks, terminateSelf, route } = build();

		await route({ type: 'shutdown', reason: 'deleted in bosun' });

		expect(sessions.cancelAll).toHaveBeenCalledOnce();
		expect(executions.cancelAll).toHaveBeenCalledOnce();
		expect(integrations.cancelAll).toHaveBeenCalledOnce();
		expect(onboarding.cancelAll).toHaveBeenCalledOnce();
		expect(asks.cancelAll).toHaveBeenCalledOnce();
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
		['[]'],
		['{"type":"queue.worktree.ensure","queueId":"q_1","slug":"auth"}'],
		// A plaintext value is exactly what sealing exists to keep off the wire.
		['{"type":"env.set","requestId":"r","path":"be","vars":[{"key":"A","value":"plain"}]}']
	])('drops %j', (raw) => {
		expect(parseServerFrame(raw)).toBeNull();
	});
});

describe('exec frames', () => {
	const start = {
		type: 'exec.start',
		runId: 'sr_1',
		buildId: 'bld_1',
		worktreePath: '/w',
		branch: 'bosun/plan/1-auth',
		baseRef: 'origin/main',
		handsOff: false,
		planId: 'p_1',
		sliceId: 'sl_1',
		planNumber: 1,
		planTitle: 'Auth',
		planBodyMd: 'body',
		profile: DEFAULT_PROJECT_PROFILE,
		configDraft: null,
		policy: null,
		portBase: 4100,
		slice: { ordinal: 1, kind: 'build', title: 'token table', bodyMd: null },
		phase: null,
		acs: [],
		planAcs: [],
		decisions: [],
		doneSlices: [],
		amendments: [],
		mergeIn: [],
		push: true,
		answer: null,
		findings: [],
		recheckCodes: [],
		memoryMaxBytes: null
	} satisfies ServerMsg;

	it('starts a run', async () => {
		const harness = build();

		await harness.route(start);

		expect(harness.executions.start).toHaveBeenCalledWith(expect.objectContaining({ runId: 'sr_1' }));
	});

	// A paused machine takes no work of either kind. Silently dropping the frame
	// would leave the slice_run row running forever with nothing to settle it.
	it('refuses a run while paused, and says so', async () => {
		const harness = build({ paused: true });

		await harness.route(start);

		expect(harness.executions.start).not.toHaveBeenCalled();
		expect(sent(harness.send)).toEqual([
			{ type: 'exec.error', runId: 'sr_1', message: 'this machine is paused' }
		]);
	});

	it('cancels a run', async () => {
		const harness = build();

		await harness.route({ type: 'exec.cancel', runId: 'sr_1' });

		expect(harness.executions.cancel).toHaveBeenCalledWith('sr_1');
	});
});

describe('env frames', () => {
	const envSets = [{ path: 'be', keys: ['DATABASE_URL'], updatedAt: '2026-09-14T00:00:00.000Z' }];

	// The store is written with what the machine's key opened, never the envelope,
	// and the reply carries names — the value is back in plaintext only here.
	it('opens sealed values before storing them, and answers with names on the socket that asked', async () => {
		const harness = build();

		harness.projectEnv.set.mockReturnValue(envSets);
		await harness.route({ type: 'env.set', requestId: 'r_1', path: 'be', vars: [{ key: 'DATABASE_URL', value: SEALED }, { key: 'KEEP', value: null }] });

		expect(harness.inputsKey.open).toHaveBeenCalledWith(SEALED);
		expect(harness.projectEnv.set).toHaveBeenCalledWith({
			path: 'be',
			vars: [{ key: 'DATABASE_URL', value: 'postgres://opened' }, { key: 'KEEP', value: null }]
		});
		expect(sent(harness.send)).toEqual([{ type: 'env.saved', requestId: 'r_1', envSets, sessionSecrets: [] }]);
	});

	it('turns a value that will not open into env.error without saving anything', async () => {
		const harness = build();

		harness.inputsKey.open.mockImplementation(() => {
			throw new Error('could not decrypt a value — it was not sealed to this machine\'s key');
		});
		await harness.route({ type: 'secrets.set', requestId: 'r_3', vars: [{ key: 'TEST_PASSWORD', value: SEALED }] });

		expect(harness.projectEnv.setSecrets).not.toHaveBeenCalled();
		expect(sent(harness.send)).toEqual([
			{ type: 'env.error', requestId: 'r_3', message: 'could not decrypt a value — it was not sealed to this machine\'s key' }
		]);
	});

	// Somebody is waiting on this request in the browser; a refusal that only
	// reached the journal would leave the form spinning.
	it('turns a refused change into env.error', async () => {
		const harness = build();

		harness.projectEnv.delete.mockImplementation(() => {
			throw new Error('invalid path "../x"');
		});
		await harness.route({ type: 'env.delete', requestId: 'r_2', path: '../x' });

		expect(sent(harness.send)).toEqual([
			{ type: 'env.error', requestId: 'r_2', message: 'invalid path "../x"' }
		]);
	});
});

describe('build worktree frames', () => {
	const ensure = {
		type: 'build.worktree.ensure',
		buildId: 'bld_1',
		slug: 'bld-1',
		branch: 'bosun/plan/4-comments',
		fresh: true,
		startFrom: 'abc1234',
		mergeIn: ['bosun/plan/3-avatars'],
		configDraft: CONFIG_WITH_SETUP
	} satisfies ServerMsg;

	// A dependent is cut from its provider, never from the base: the branch is
	// decided before anything is installed, so setup runs on the code the first
	// bullet builds on.
	it('cuts the build branch from its provider before writing env files and running setup', async () => {
		const harness = build();

		await harness.route(ensure);

		expect(harness.commit.startBuildBranch).toHaveBeenCalledWith({
			worktreePath: '/nonexistent-worktree',
			branch: 'bosun/plan/4-comments',
			baseRef: 'origin/main',
			fresh: true,
			startFrom: 'abc1234',
			mergeIn: ['bosun/plan/3-avatars']
		});
		expect(harness.commit.startBuildBranch.mock.invocationCallOrder[0]).toBeLessThan(
			harness.projectEnv.applyTo.mock.invocationCallOrder[0]!
		);
		expect(harness.projectEnv.applyTo.mock.invocationCallOrder[0]).toBeLessThan(
			harness.setupSteps.runAll.mock.invocationCallOrder[0]!
		);
		expect(harness.sink).toHaveBeenCalledWith({
			type: 'build.worktree.ready',
			buildId: 'bld_1',
			worktreePath: '/nonexistent-worktree',
			baseRef: 'origin/main',
			headSha: 'abc123'
		});
	});

	// A provider branch that will not merge leaves nothing to set up on, and a build
	// reported ready over it fails an hour into its first bullet.
	it('reports a branch that could not be cut without running setup', async () => {
		const harness = build();

		harness.commit.startBuildBranch.mockResolvedValue({ ok: false, detail: 'merging origin/bosun/plan/3-avatars conflicts with this branch' });
		await harness.route(ensure);

		expect(harness.setupSteps.runAll).not.toHaveBeenCalled();
		expect(harness.sink).toHaveBeenCalledWith({
			type: 'build.worktree.error',
			buildId: 'bld_1',
			message: 'merging origin/bosun/plan/3-avatars conflicts with this branch'
		});
	});

	it('fails the build with the setup failure rather than reporting the worktree ready', async () => {
		const harness = build();

		harness.setupSteps.runAll.mockResolvedValue({ ok: false, step: 'install', message: 'setup step "install" failed (exited with 1):\nERR_PNPM_NO_LOCKFILE' });
		await harness.route(ensure);

		expect(harness.sink).toHaveBeenCalledWith({
			type: 'build.worktree.error',
			buildId: 'bld_1',
			message: 'setup step "install" failed (exited with 1):\nERR_PNPM_NO_LOCKFILE'
		});
	});

	// A build taking a slot again only re-runs what changed; running every install
	// again on each release would spend minutes a resumed bullet does not need.
	it('re-runs only the changed setup steps when the build is resuming', async () => {
		const harness = build();

		await harness.route({ ...ensure, fresh: false });

		expect(harness.setupSteps.runAll).not.toHaveBeenCalled();
		expect(harness.setupSteps.rerunChanged).toHaveBeenCalled();
	});

	it('removes the worktree and forgets its setup state', async () => {
		const harness = build();

		await harness.route({ type: 'build.worktree.remove', buildId: 'bld_1', slug: 'bld-1' });

		expect(harness.worktree.remove).toHaveBeenCalledWith('bld-1');
		expect(harness.setupSteps.forget).toHaveBeenCalledWith('bld-1');
	});
});

describe('integration frames', () => {
	const integrate = {
		type: 'integrate.start',
		integrationId: 'int_1',
		buildId: 'bld_1',
		worktreePath: '/w',
		branch: 'bosun/plan/4-comments',
		onto: 'main',
		configDraft: null,
		autoResolve: true,
		criteria: { planNumber: 4, title: 'Comments', acs: [] },
		portBase: 4100,
		memoryMaxBytes: null
	} satisfies ServerMsg;

	it('starts and cancels an integration', async () => {
		const harness = build();

		await harness.route(integrate);
		await harness.route({ type: 'integrate.cancel', integrationId: 'int_1' });

		expect(harness.integrations.start).toHaveBeenCalledWith(expect.objectContaining({ integrationId: 'int_1' }));
		expect(harness.integrations.cancel).toHaveBeenCalledWith('int_1');
	});

	// An integration runs checks and possibly a session; a paused machine refusing
	// it silently would leave the build integrating forever.
	it('refuses an integration while paused, and says so', async () => {
		const harness = build({ paused: true });

		await harness.route(integrate);

		expect(harness.integrations.start).not.toHaveBeenCalled();
		expect(sent(harness.send)).toEqual([
			{ type: 'integrate.needs_you', integrationId: 'int_1', reason: 'error', detail: 'this machine is paused' }
		]);
	});
});

describe('line questions', () => {
	const ask = {
		type: 'line.ask',
		repositoryId: 'repo_1',
		askId: 'rm_1',
		question: 'where is #4 up to?',
		state: '#4 Comments — building',
		transcript: []
	} satisfies ServerMsg;

	// A question is read-only and answers something a person is waiting on, so a
	// paused machine still takes it. Pausing stops bosun dispatching work, not
	// somebody asking what happened.
	it('answers one even while the machine is paused', async () => {
		const harness = build({ paused: true });

		await harness.route(ask);

		expect(harness.asks.ask).toHaveBeenCalledWith(expect.objectContaining({ askId: 'rm_1' }));
	});
});
