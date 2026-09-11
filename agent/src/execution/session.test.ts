import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExecutionSessions } from './session';
import { type ExecStart } from '../protocol';
import { type Services } from '../services/index';

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

function services(startBranch: () => Promise<{ ok: boolean; detail: string }>) {
	return {
		commit: { startBranch, cleanTree: vi.fn() },
		mcpConfig: { read: vi.fn().mockReturnValue({ servers: {}, serverNames: [], error: null }) }
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
});
