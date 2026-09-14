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

vi.mock('../services/setup-steps.service', () => ({
	runShell: vi.fn().mockResolvedValue({ ok: true, tail: '', detail: 'done' })
}));

const START = {
	type: 'exec.start',
	runId: 'sr_1',
	buildId: 'bld_1',
	worktreePath: '/w',
	branch: 'bosun/plan/1-x',
	baseRef: 'origin/main',
	handsOff: false,
	planId: 'p_1',
	sliceId: 's_1',
	planNumber: 1,
	planTitle: 'A plan',
	planBodyMd: '',
	profile: { startCommand: null, setupCommand: null, testCredentialsPath: null },
	portBase: 4100,
	slice: { ordinal: 1, kind: 'build', title: 'build it', bodyMd: '' },
	phase: null,
	acs: [],
	planAcs: [{ code: 'AC-1', text: 'a comment can be posted' }],
	decisions: [],
	doneSlices: [],
	amendments: [],
	mergeIn: [],
	push: true,
	answer: null,
	findings: [],
	recheckCodes: [],
	configDraft: null,
	policy: null,
	memoryMaxBytes: null
} as unknown as ExecStart;

const LANE_DRAFT = [
	'version: 1',
	'apps:',
	'  be:',
	'    cwd: be',
	'    start: pnpm local',
	'    migrate: pnpm db:migration:run',
	'verify:',
	'  resetDatabase:',
	'    cwd: be',
	'    run: pnpm db:reset',
	''
].join('\n');

function services(
	cleanTree: () => Promise<{ ok: boolean; detail: string }>,
	scope: { unit: string; memoryMaxBytes: number } | null = null,
	applyTo: () => { written: string[]; skipped: string[] } = () => ({ written: [], skipped: [] }),
	repositoryId: string | null = null
) {
	return {
		claudeAuth: { sessionEnv: vi.fn().mockReturnValue({}) },
		stack: { down: vi.fn().mockResolvedValue(undefined) },
		workspace: { repositoryId: vi.fn().mockReturnValue(repositoryId) },
		setupSteps: { runLegacy: vi.fn(), rerunChanged: vi.fn().mockResolvedValue({ ok: true, ran: [] }) },
		toolchain: { ensure: vi.fn() },
		commit: { cleanTree, discardChanges: vi.fn() },
		mcpConfig: { read: vi.fn().mockReturnValue({ servers: {}, serverNames: [], error: null }) },
		memory: { sessionScope: vi.fn().mockReturnValue(scope) },
		projectEnv: {
			applyTo: vi.fn(applyTo),
			summary: vi.fn().mockReturnValue([
				{ path: 'be', keys: ['DATABASE_URL'], updatedAt: '2026-09-14T00:00:00.000Z' },
				{ path: 'fe', keys: ['NUXT_PUBLIC_API_URL'], updatedAt: '2026-09-14T00:00:00.000Z' }
			]),
			secretNames: vi.fn().mockReturnValue([]),
			secretValues: vi.fn().mockReturnValue({})
		}
	} as unknown as Services;
}

describe('createExecutionSessions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// `hello` answers with `held()`, and a run missing from it is one the backend
	// puts back. Setting up the worktree takes a fetch and a reset, so a reconnect
	// lands inside this window regularly.
	it('holds the run while the worktree is still being prepared', async () => {
		let release: (() => void) | undefined;
		const branching = new Promise<void>((resolve) => {
			release = resolve;
		});
		const sessions = createExecutionSessions({
			services: services(async () => {
				await branching;

				return { ok: true, detail: 'cleaned' };
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

				return { ok: true, detail: 'cleaned' };
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
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }), scope);
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
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }), null, () => {
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

	// A repository bullet runs on the config of the tree it is in, or the draft when
	// that tree has none. One that does not validate stops here, naming the field,
	// rather than a session discovering it an hour in.
	it('stops a repository bullet whose config does not validate, before any session starts', async () => {
		const send = vi.fn();
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }), null, undefined, 'repo_1');

		await createExecutionSessions({ services: deps, send }).start({
			...START,
			worktreePath: '/nonexistent-worktree',
			configDraft: 'version: 1\napps:\n  be:\n    cwd: be\n'
		});

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(spawnClaudeSession).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({
			type: 'exec.error',
			runId: 'sr_1',
			message: expect.stringContaining("the repository's draft config is invalid — apps.be.start:")
		});
	});

	// Naming a file that was skipped sends the session after a connection that is
	// not in the worktree, and it reports a blocker nobody can find.
	it('names only the env files actually written, by key', async () => {
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }), null, () => ({
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

describe('lane sessions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// The lane owns the development database: a drive verdict reached against the
	// schema some other plan left behind proves nothing.
	it('resets the database and migrates before a drive starts, on a machine that allows it', async () => {
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }), null, undefined, 'repo_1');

		await createExecutionSessions({ services: deps, send: vi.fn() }).start({
			...START,
			worktreePath: '/nonexistent-worktree',
			phase: 'drive',
			slice: { ordinal: 2, kind: 'verify', title: 'verify', bodyMd: null },
			configDraft: LANE_DRAFT,
			policy: { applyMigrations: true }
		});

		const { runShell } = await import('../services/setup-steps.service');
		const { spawnClaudeSession } = await import('../sessions/process');
		const commands = vi.mocked(runShell).mock.calls.map(([call]) => call.command);
		const session = vi.mocked(spawnClaudeSession).mock.calls[0]![0];

		expect(commands).toEqual(['pnpm db:reset', 'pnpm db:migration:run']);
		expect(vi.mocked(runShell).mock.invocationCallOrder.at(-1)).toBeLessThan(
			vi.mocked(spawnClaudeSession).mock.invocationCallOrder[0]!
		);
		expect(session.prompt).toContain('You are driving plan #1');
		expect(session.tools.builtin).not.toContain('Edit');
		expect(session.tools.mcp).toContain('mcp__bosun__report_finding');
		expect(session.tools.mcp).not.toContain('mcp__bosun__bosun_ask');
	});

	// A machine pointed at a database bosun must not migrate is not one to reset
	// either.
	it('leaves the database alone where the machine does not allow migrations', async () => {
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }), null, undefined, 'repo_1');

		await createExecutionSessions({ services: deps, send: vi.fn() }).start({
			...START,
			worktreePath: '/nonexistent-worktree',
			phase: 'drive',
			configDraft: LANE_DRAFT,
			policy: { applyMigrations: false }
		});

		const { runShell } = await import('../services/setup-steps.service');

		expect(runShell).not.toHaveBeenCalled();
	});

	// A drive that failed to reset must not go on to drive: its verdict would be
	// against whatever the database held.
	it('fails the drive on a database step that fails, before any session starts', async () => {
		const send = vi.fn();
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }), null, undefined, 'repo_1');
		const { runShell } = await import('../services/setup-steps.service');

		vi.mocked(runShell).mockResolvedValueOnce({ ok: false, tail: 'relation locked', detail: 'exited with 1' });
		await createExecutionSessions({ services: deps, send }).start({
			...START,
			worktreePath: '/nonexistent-worktree',
			phase: 'drive',
			configDraft: LANE_DRAFT,
			policy: { applyMigrations: true }
		});

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(spawnClaudeSession).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({
			type: 'exec.error',
			runId: 'sr_1',
			message: 'Reset the database failed (exited with 1):\nrelation locked'
		});
	});

	// The build bullet is the only session that may ask; a hands-off plan's may not.
	it('gives a hands-off bullet no way to ask', async () => {
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }));

		await createExecutionSessions({ services: deps, send: vi.fn() }).start({ ...START, handsOff: true });

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(vi.mocked(spawnClaudeSession).mock.calls[0]![0].tools.mcp).not.toContain('mcp__bosun__bosun_ask');
	});

	it('restarts a bullet with the answer to the question it asked', async () => {
		const deps = services(async () => ({ ok: true, detail: 'cleaned' }));

		await createExecutionSessions({ services: deps, send: vi.fn() }).start({
			...START,
			answer: {
				questions: [{ header: 'Deleted', question: 'Show deleted comments as placeholders?', options: [], multiSelect: false }],
				answers: [{ selected: ['Yes, as placeholders'] }]
			},
			amendments: ['`users.timezone` comes from #7 — use it, do not create it']
		});

		const { spawnClaudeSession } = await import('../sessions/process');
		const prompt = vi.mocked(spawnClaudeSession).mock.calls[0]![0].prompt;

		expect(prompt).toContain('**Show deleted comments as placeholders?** → Yes, as placeholders');
		expect(prompt).toContain('`users.timezone` comes from #7 — use it, do not create it');
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
