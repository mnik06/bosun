import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickFixSessions, quickFixCommitMessage } from './session';
import { type QuickFixStart } from '../protocol';
import { type Services } from '../services/index';

vi.mock('../sessions/mcp-server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../sessions/mcp-server')>();

	return {
		...actual,
		startSessionMcpServer: vi.fn().mockResolvedValue({
			configPath: '/tmp/mcp.json',
			close: vi.fn().mockResolvedValue(undefined),
			answer: vi.fn()
		})
	};
});

vi.mock('../sessions/process', () => ({
	spawnClaudeSession: vi.fn().mockReturnValue({ kill: vi.fn(), send: vi.fn() })
}));

const START: QuickFixStart = {
	type: 'quickfix.start',
	quickFixId: 'qf_1',
	branch: 'bosun/quickfix/qf_1-fix-the-typo',
	baseRef: 'main',
	description: 'The signup button is unreadable on dark mode.',
	memoryMaxBytes: null
};

function services(opts?: {
	ensure?: () => Promise<{ ok: boolean; worktreePath: string; baseRef: string; detail: string }>;
	startBuildBranch?: () => Promise<{ ok: boolean; detail: string }>;
	applyTo?: () => { written: string[]; skipped: string[] };
}) {
	return {
		claudeAuth: { sessionEnv: vi.fn().mockReturnValue({}) },
		workspace: { repositoryId: vi.fn().mockReturnValue('repo_1') },
		worktree: {
			ensure:
				opts?.ensure ??
				vi.fn().mockResolvedValue({ ok: true, worktreePath: '/w/qf_1', baseRef: 'origin/main', detail: 'created' }),
			pathFor: vi.fn().mockReturnValue('/w/qf_1'),
			remove: vi.fn().mockResolvedValue(undefined)
		},
		commit: {
			startBuildBranch: opts?.startBuildBranch ?? vi.fn().mockResolvedValue({ ok: true, detail: 'branched' }),
			commitAll: vi.fn().mockResolvedValue({ ok: true, commitSha: 'deadbeef', detail: 'committed' }),
			pushBranch: vi.fn().mockResolvedValue({ ok: true, detail: 'pushed' }),
			changedFiles: vi.fn().mockResolvedValue(['app/styles.css'])
		},
		setupSteps: { runAll: vi.fn().mockResolvedValue({ ok: true, ran: [] }) },
		toolchain: { ensure: vi.fn() },
		memory: { sessionScope: vi.fn().mockReturnValue(null) },
		exec: { run: vi.fn().mockResolvedValue({ ok: true, stdout: '', stderr: '', reason: '' }) },
		projectEnv: {
			applyTo: vi.fn(opts?.applyTo ?? (() => ({ written: [], skipped: [] }))),
			summary: vi.fn().mockReturnValue([]),
			secretNames: vi.fn().mockReturnValue([]),
			secretValues: vi.fn().mockReturnValue({})
		}
	} as unknown as Services;
}

describe('quickFixCommitMessage', () => {
	it('takes the description as the subject when it is short', () => {
		expect(quickFixCommitMessage('the button is unreadable')).toBe('Quick fix: the button is unreadable');
	});

	it('takes only the first line of a multi-line description', () => {
		expect(quickFixCommitMessage('the button is unreadable\n\nSteps to reproduce:\n1. ...')).toBe(
			'Quick fix: the button is unreadable'
		);
	});

	it('truncates a long subject with an ellipsis', () => {
		const long = 'a'.repeat(100);

		expect(quickFixCommitMessage(long)).toBe(`Quick fix: ${'a'.repeat(71)}…`);
	});

	it('falls back to a generic subject for a blank description', () => {
		expect(quickFixCommitMessage('   ')).toBe('Quick fix');
	});
});

describe('createQuickFixSessions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// The backend admits a quick fix onto a machine that has since lost its
	// repository, or whose worktree cannot be created. Nothing should be left
	// running, and the reason has to reach the operator rather than the box's log.
	it('fails clearly when the worktree cannot be prepared, without starting a session', async () => {
		const send = vi.fn();
		const deps = services({
			ensure: vi.fn().mockResolvedValue({ ok: false, worktreePath: '/w/qf_1', baseRef: '', detail: 'no repository attached' })
		});

		await createQuickFixSessions({ services: deps, send }).start(START);

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(spawnClaudeSession).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({
			type: 'quickfix.error',
			quickFixId: 'qf_1',
			message: 'no repository attached'
		});
	});

	// A cut branch on the wrong base is a fix nobody can land, so a merge conflict
	// or a missing base ref stops the run before any session ever starts editing.
	it('fails clearly when the branch cannot be cut, without starting a session', async () => {
		const send = vi.fn();
		const deps = services({
			startBuildBranch: vi.fn().mockResolvedValue({ ok: false, detail: 'main is not on the remote' })
		});

		await createQuickFixSessions({ services: deps, send }).start(START);

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(spawnClaudeSession).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({
			type: 'quickfix.error',
			quickFixId: 'qf_1',
			message: 'main is not on the remote'
		});
	});

	// A quick fix has no cancel frame of its own — only a shutdown tears one down
	// mid-flight — but the race is the same one a build bullet guards against:
	// carrying on would start a session for a run bosun already gave up on.
	it('does not start a session for a run cancelled while its worktree was being prepared', async () => {
		let release: (() => void) | undefined;
		const branching = new Promise<void>((resolve) => {
			release = resolve;
		});
		const send = vi.fn();
		const deps = services({
			ensure: vi.fn().mockImplementation(async () => {
				await branching;

				return { ok: true, worktreePath: '/w/qf_1', baseRef: 'origin/main', detail: 'created' };
			})
		});
		const sessions = createQuickFixSessions({ services: deps, send });

		const started = sessions.start(START);

		sessions.cancelAll();
		release!();
		await started;

		const { spawnClaudeSession } = await import('../sessions/process');

		expect(spawnClaudeSession).not.toHaveBeenCalled();
	});

	// A fix session without its connection is how bullets used to end up building a
	// database of their own, so a file that cannot be written stops the fix before
	// any session exists to make the mistake.
	it('fails before starting anything when the provided env files cannot be written', async () => {
		const send = vi.fn();
		const deps = services({
			applyTo: () => {
				throw new Error('could not write be/.env: EACCES');
			}
		});

		await createQuickFixSessions({ services: deps, send }).start(START);

		const { startSessionMcpServer } = await import('../sessions/mcp-server');
		const { spawnClaudeSession } = await import('../sessions/process');

		expect(startSessionMcpServer).not.toHaveBeenCalled();
		expect(spawnClaudeSession).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({
			type: 'quickfix.error',
			quickFixId: 'qf_1',
			message: 'could not write the provided env files: could not write be/.env: EACCES'
		});
	});

	// The session itself never commits or pushes — a model doing that leaves no
	// single sha bosun can point a pull request at — so a crash or an OOM kill
	// before it produced a result must still end the quick fix, not hang it.
	it('reports a clear failure when the session exits without producing a result', async () => {
		const send = vi.fn();
		const deps = services();
		const { spawnClaudeSession } = await import('../sessions/process');

		vi.mocked(spawnClaudeSession).mockImplementationOnce((sessionOpts) => {
			sessionOpts.onExit(1, { signal: null, oomKills: 0 });

			return { kill: vi.fn(), send: vi.fn() };
		});

		await createQuickFixSessions({ services: deps, send }).start(START);

		expect(send).toHaveBeenCalledWith({
			type: 'quickfix.error',
			quickFixId: 'qf_1',
			message: expect.stringContaining('claude exited with code 1')
		});
		expect(deps.worktree.remove).toHaveBeenCalledWith('qf_1');
	});
});
