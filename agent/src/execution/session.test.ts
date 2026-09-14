import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExecutionSessions, exitMessage } from './session';
import { type ExecStart } from '../protocol';
import { type Services } from '../services/index';

const GIB = 1024 ** 3;

vi.mock('../sessions/mcp-server', () => ({
	startSessionMcpServer: vi.fn().mockResolvedValue({
		configPath: '/tmp/mcp.json',
		close: vi.fn().mockResolvedValue(undefined),
		answer: vi.fn()
	})
}));

vi.mock('../sessions/process', () => ({
	spawnClaudeSession: vi.fn().mockReturnValue({ kill: vi.fn(), write: vi.fn() })
}));

const START = {
	type: 'exec.start',
	runId: 'sr_1',
	worktreePath: '/w',
	branch: 'bosun/plan/q/1-x',
	baseRef: 'main',
	freshBranch: true,
	afk: false,
	planId: 'p_1',
	sliceId: 's_1',
	planNumber: 1,
	planTitle: 'A plan',
	planBodyMd: '',
	profile: { startCommand: null, setupCommand: null, testCredentialsPath: null },
	portBase: 4100,
	slice: { ordinal: 1, kind: 'build', title: 'build it', bodyMd: '' },
	acs: [],
	planAcs: [],
	decisions: [],
	doneSlices: []
} as unknown as ExecStart;

function services(
	startBranch: () => Promise<{ ok: boolean; detail: string }>,
	scope: { unit: string; memoryMaxBytes: number } | null = null
) {
	return {
		commit: { startBranch, cleanTree: vi.fn() },
		mcpConfig: { read: vi.fn().mockReturnValue({ servers: {}, serverNames: [], error: null }) },
		memory: { sessionScope: vi.fn().mockReturnValue(scope) }
	} as unknown as Services;
}

describe('createExecutionSessions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// `hello` answers with `held()`, and a run missing from it is one the backend
	// puts back and pauses the queue over. Setting up the worktree takes a fetch
	// and a reset, so a reconnect lands inside this window regularly.
	it('holds the run while the worktree is still being prepared', async () => {
		let release: (() => void) | undefined;
		const branching = new Promise<void>((resolve) => {
			release = resolve;
		});
		const sessions = createExecutionSessions({
			services: services(async () => {
				await branching;

				return { ok: true, detail: 'branched' };
			}),
			send: vi.fn()
		});

		const started = sessions.start(START);

		expect(sessions.held()).toEqual(['sr_1']);

		release!();
		await started;

		expect(sessions.held()).toEqual(['sr_1']);
	});

	// The backend cancels a bullet it has taken back. Arriving mid-setup, that
	// used to hit an empty map and be ignored, and the session started anyway —
	// building into a worktree nobody was watching.
	it('does not start a session cancelled while the worktree was being prepared', async () => {
		let release: (() => void) | undefined;
		const branching = new Promise<void>((resolve) => {
			release = resolve;
		});
		const send = vi.fn();
		const sessions = createExecutionSessions({
			services: services(async () => {
				await branching;

				return { ok: true, detail: 'branched' };
			}),
			send
		});

		const started = sessions.start(START);

		sessions.cancel('sr_1');
		release!();
		await started;

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(spawnClaudeSession).not.toHaveBeenCalled();
		expect(sessions.held()).toEqual([]);
	});

	// The limit is what keeps one bullet running out of memory from reaching the
	// agent, and the scheduler is the only party that knows what else is running.
	it('runs the session under the limit the scheduler chose', async () => {
		const scope = { unit: 'bosun-run-sr_1', memoryMaxBytes: 3 * GIB };
		const deps = services(async () => ({ ok: true, detail: 'branched' }), scope);
		const sessions = createExecutionSessions({ services: deps, send: vi.fn() });

		await sessions.start({ ...START, memoryMaxBytes: 3 * GIB });

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(deps.memory.sessionScope).toHaveBeenCalledWith({
			runId: 'sr_1',
			memoryMaxBytes: 3 * GIB
		});
		expect(spawnClaudeSession).toHaveBeenCalledWith(expect.objectContaining({ scope }));
	});
});

describe('exitMessage', () => {
	it('passes a crash through as the session reported it', () => {
		expect(
			exitMessage({
				code: 1,
				exit: { signal: null, oomKills: 0 },
				stderr: 'API error\n',
				limitBytes: 3 * GIB
			})
		).toBe('API error');
	});

	// Killed for memory, `claude` leaves no stderr and no code. Without the scope's
	// counter this read "claude exited with code unknown".
	it('names memory when the kernel killed the session itself', () => {
		expect(
			exitMessage({
				code: null,
				exit: { signal: 'SIGKILL', oomKills: 1 },
				stderr: '',
				limitBytes: 6 * GIB
			})
		).toBe('the bullet ran out of memory: the kernel killed its session at its limit of 6.0 GB');
	});

	it('keeps what the session said when only its commands were killed', () => {
		expect(
			exitMessage({
				code: 1,
				exit: { signal: null, oomKills: 2 },
				stderr: 'tests failed',
				limitBytes: 3 * GIB
			})
		).toBe('tests failed (2 commands in this bullet ran out of memory at its limit of 3.0 GB)');
	});
});
