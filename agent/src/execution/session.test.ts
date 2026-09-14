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
	scope: { unit: string; memoryMaxBytes: number } | null = null,
	applyTo: () => { written: string[]; skipped: string[] } = () => ({ written: [], skipped: [] })
) {
	return {
		commit: { startBranch, cleanTree: vi.fn() },
		mcpConfig: { read: vi.fn().mockReturnValue({ servers: {}, serverNames: [], error: null }) },
		memory: { sessionScope: vi.fn().mockReturnValue(scope) },
		projectEnv: {
			applyTo: vi.fn(applyTo),
			summary: vi.fn().mockReturnValue([
				{ path: 'be', keys: ['DATABASE_URL'], updatedAt: '2026-09-14T00:00:00.000Z' },
				{ path: 'fe', keys: ['NUXT_PUBLIC_API_URL'], updatedAt: '2026-09-14T00:00:00.000Z' }
			])
		}
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

	// A bullet without its connection is how sessions ended up building a database
	// in /tmp, so a file that cannot be written stops the bullet before one exists.
	it('fails the bullet before starting anything when the env files cannot be written', async () => {
		const send = vi.fn();
		const deps = services(async () => ({ ok: true, detail: 'branched' }), null, () => {
			throw new Error('could not write be/.env: EACCES');
		});

		await createExecutionSessions({ services: deps, send }).start(START);

		const { startSessionMcpServer } = await import('../sessions/mcp-server');
		const { spawnClaudeSession } = await import('../sessions/process');

		expect(startSessionMcpServer).not.toHaveBeenCalled();
		expect(spawnClaudeSession).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({
			type: 'exec.error',
			runId: 'sr_1',
			message: 'could not write the provided env files: could not write be/.env: EACCES'
		});
	});

	// Naming a file that was skipped sends the session after a connection that is
	// not in the worktree, and it reports a blocker nobody can find.
	it('names only the env files actually written, by key', async () => {
		const deps = services(async () => ({ ok: true, detail: 'branched' }), null, () => ({
			written: ['be/.env'],
			skipped: ['fe/.env']
		}));

		await createExecutionSessions({ services: deps, send: vi.fn() }).start(START);

		const { spawnClaudeSession } = await import('../sessions/process');
		const prompt = vi.mocked(spawnClaudeSession).mock.calls[0]![0].prompt;

		expect(prompt).toContain('`be/.env`: DATABASE_URL');
		expect(prompt).not.toContain('fe/.env');
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
