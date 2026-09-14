import fs from 'fs';
import os from 'os';
import path from 'path';
import { launchBrowser } from './browser.service';
import { type ClaudeAuthService } from './claude-auth.service';
import { type ExecService } from './exec.service';
import { type McpConfigService } from './mcp-config.service';
import { formatGib, type MemoryService } from './memory.service';
import { describeEnvSets, type ProjectEnvService } from './project-env.service';
import { NO_REPOSITORY, repoPathGetter, type RepoPathSource } from './repo.service';
import { type WorkspaceService } from './workspace.service';
import { type PreflightCheck } from '../protocol';
import { PROJECT_CONFIG_PATH } from '../project-config';

const MIN_CLAUDE_MAJOR = 2;

// What `npx playwright install chromium` leaves behind. The headless shell is a
// separate download in recent Playwright and is what a headless launch prefers,
// so either one means a browser this machine can drive.
const BROWSER_PREFIXES = ['chromium-', 'chromium_headless_shell-'];

// Playwright keeps its browser builds in a cache directory rather than on the
// PATH, so nothing that looks at a machine the ordinary way can tell whether one
// is there.
export function browserCachePath(opts: {
	platform: NodeJS.Platform;
	home: string;
	configured?: string;
}): string | null {
	// `0` is Playwright's own opt-out: the build sits beside the package, wherever
	// npx unpacked it, and there is nothing here to look at.
	if (opts.configured === '0') {
		return null;
	}

	if (opts.configured !== undefined && opts.configured !== '') {
		return opts.configured;
	}

	if (opts.platform === 'darwin') {
		return path.join(opts.home, 'Library', 'Caches', 'ms-playwright');
	}

	if (opts.platform === 'win32') {
		return path.join(opts.home, 'AppData', 'Local', 'ms-playwright');
	}

	return path.join(opts.home, '.cache', 'ms-playwright');
}

export function hasBrowserBuild(cachePath: string): boolean {
	try {
		return fs
			.readdirSync(cachePath)
			.some((entry) => BROWSER_PREFIXES.some((prefix) => entry.startsWith(prefix)));
	} catch {
		return false;
	}
}

export function claudeVersionIsSupported(version: string): boolean {
	// The stream-json event shape is a looser contract than a package version, so
	// a major the parser has never seen is reported rather than assumed to work.
	return Number(version.match(/(\d+)\./)?.[1] ?? 0) >= MIN_CLAUDE_MAJOR;
}

export function getPreflightService(deps: {
	exec: ExecService;
	claudeAuth: ClaudeAuthService;
	mcpConfig: McpConfigService;
	memory: MemoryService;
	projectEnv: ProjectEnvService;
	workspace: Pick<WorkspaceService, 'repositoryId' | 'configOnDefault'>;
	repoPath: RepoPathSource;
}) {
	const currentRepoPath = repoPathGetter(deps.repoPath);

	// One check, two probes. A missing binary and a missing login are different
	// fixes, so the detail says which one failed rather than collapsing to
	// "claude: failed" and sending the operator to look at the wrong thing.
	async function checkClaude(): Promise<PreflightCheck> {
		const version = await deps.exec.run('claude', ['--version']);

		if (!version.ok) {
			return { name: 'claude', ok: false, detail: `claude: ${version.reason}` };
		}

		if (!claudeVersionIsSupported(version.stdout)) {
			return {
				name: 'claude',
				ok: false,
				detail: `${version.stdout} — bosun is tested against claude ${MIN_CLAUDE_MAJOR}.x`
			};
		}

		const status = await deps.claudeAuth.readStatus();

		return {
			name: 'claude',
			ok: status.loggedIn,
			detail: status.loggedIn ? `${version.stdout} — ${status.detail}` : status.detail
		};
	}

	// Reports what is configured and parseable, not what connects: `claude mcp list`
	// reads the CLI's own config sources rather than the one bosun assembles, so it
	// would answer a different question. A server that parses but refuses to start
	// surfaces in the session's own stderr.
	function checkCustomMcp(): PreflightCheck {
		const config = deps.mcpConfig.read();

		if (!config.present) {
			return { name: 'mcp', ok: true, detail: 'no custom servers configured' };
		}

		if (config.error) {
			return { name: 'mcp', ok: false, detail: `${deps.mcpConfig.configPath}: ${config.error}` };
		}

		if (config.unresolved.length > 0) {
			return {
				name: 'mcp',
				ok: false,
				detail: `unset in ~/.bosun/env: ${config.unresolved.join(', ')}`
			};
		}

		return {
			name: 'mcp',
			ok: true,
			detail: config.serverNames.length > 0 ? config.serverNames.join(', ') : 'no servers declared'
		};
	}

	// Queues are git worktrees of this checkout, so a repo path that is not a
	// repository is not a queue that fails later — it is a queue that can never be
	// created at all.
	async function checkGit(): Promise<PreflightCheck> {
		const version = await deps.exec.run('git', ['--version'], {});

		if (!version.ok) {
			return { name: 'git', ok: false, detail: `git: ${version.reason}` };
		}

		const repoPath = currentRepoPath();

		if (repoPath === null) {
			return { name: 'git', ok: false, detail: `${version.stdout} · ${NO_REPOSITORY}` };
		}

		const inside = await deps.exec.run(
			'git',
			['-C', repoPath, 'rev-parse', '--is-inside-work-tree'],
			{}
		);

		if (!inside.ok || inside.stdout.trim() !== 'true') {
			return { name: 'git', ok: false, detail: `${repoPath} is not a git repository` };
		}

		const reach = await checkRemote(repoPath);

		return {
			name: 'git',
			ok: reach.ok,
			detail: `${version.stdout} · ${repoPath} · ${reach.detail}`
		};
	}

	// A machine that cannot reach the remote does not fail loudly — it plans and
	// builds against whatever the last successful fetch left behind, which is the
	// one failure mode that produces confidently wrong work. It is worth a red
	// check even though sessions still start.
	//
	// `ls-remote` rather than `fetch`: it transfers no objects, and the question is
	// only whether the credentials in the service environment reach the remote at
	// all. Prompts are disabled on both transports, because a check that blocks on
	// a passphrase never returns. On a repository machine this is also the proof
	// that the credential helper gets a token from bosun.
	async function checkRemote(repoPath: string): Promise<{ ok: boolean; detail: string }> {
		const remotes = await deps.exec.run('git', ['-C', repoPath, 'remote'], {});

		if (!remotes.ok || remotes.stdout.trim() === '') {
			return { ok: true, detail: 'no remote — nothing to fetch' };
		}

		const reachable = await deps.exec.run(
			'git',
			['-C', repoPath, 'ls-remote', '--quiet', '--exit-code', 'origin', 'HEAD'],
			{
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: '0',
					GIT_SSH_COMMAND: 'ssh -oBatchMode=yes'
				},
				timeoutMs: 30_000
			}
		);

		return reachable.ok
			? { ok: true, detail: 'origin reachable' }
			: {
				ok: false,
				detail: `cannot reach origin, so every session reads a stale checkout: ${reachable.reason}`
			};
	}

	// Never red — queues run fine without it, they simply cannot open a pull
	// request, and a machine used only for building should not look broken for
	// that. A repository machine has no use for it at all: its pull requests are
	// opened by bosun through the GitHub App.
	async function checkGh(): Promise<PreflightCheck> {
		if (deps.workspace.repositoryId() !== null) {
			return { name: 'gh', ok: true, detail: 'not needed — pull requests are opened through the GitHub App' };
		}

		const version = await deps.exec.run('gh', ['--version'], {});

		if (!version.ok) {
			return {
				name: 'gh',
				ok: true,
				detail: 'not installed — queues will commit but cannot open pull requests'
			};
		}

		const status = await deps.exec.run('gh', ['auth', 'status'], {});

		return {
			name: 'gh',
			ok: true,
			detail: status.ok
				? 'signed in'
				: 'installed but not signed in — run `gh auth login`, then `gh auth setup-git`'
		};
	}

	// Red rather than quiet, unlike `gh`, and launched rather than looked for. A
	// build in the cache that cannot start — a fresh Ubuntu lacks the libraries it
	// links against — still starts the Playwright server, and its tools only fail
	// when a bullet calls one, an hour in.
	async function checkBrowser(): Promise<PreflightCheck> {
		const config = deps.mcpConfig.read();

		// `read()` merges bosun's defaults, so a machine that has not configured
		// anything still reports playwright; one that switched it off with `null`
		// does not, and needs no browser.
		if (!config.serverNames.includes('playwright')) {
			return { name: 'browser', ok: true, detail: 'playwright is switched off here' };
		}

		const launched = await launchBrowser({
			exec: deps.exec,
			cachePath: browserCachePath({
				platform: process.platform,
				home: os.homedir(),
				configured: process.env.PLAYWRIGHT_BROWSERS_PATH
			})
		});

		return { name: 'browser', ok: launched.ok, detail: launched.detail };
	}

	// Red only where the limits are missing on Linux, the one case that changes what
	// a bullet running out of memory does: without a scope it runs inside the
	// agent's own unit and can take the agent down with it. Never blocks anything.
	function checkMemory(): PreflightCheck {
		const memory = deps.memory.report();

		if (memory === undefined) {
			return {
				name: 'memory',
				ok: true,
				detail: 'not measured on this platform — bullets run without a memory limit'
			};
		}

		const swap =
			memory.swapTotalBytes === 0 ? 'no swap' : `${formatGib(memory.swapTotalBytes)} swap`;
		const size = `${formatGib(memory.totalBytes)} RAM, ${swap}`;

		return memory.sessionLimits
			? { name: 'memory', ok: true, detail: `${size} · every bullet runs under its own memory limit` }
			: {
				name: 'memory',
				ok: false,
				detail: `${size} · systemd-run --user is unavailable, so bullets run without a memory limit and one that runs out can take the agent down with it`
			};
	}

	// Never red: plenty of projects need no connection at all. It is here so that an
	// operator can see before a verify bullet runs that it will have no database.
	function checkEnv(): PreflightCheck {
		const secrets = deps.projectEnv.secretNames();
		const secretLine = secrets.length === 0 ? '' : ` · session secrets: ${secrets.join(', ')}`;

		return { name: 'env', ok: true, detail: `${describeEnvSets(deps.projectEnv.summary())}${secretLine}` };
	}

	// Which of the two configs a repository machine's sessions run on. Only the
	// default branch is looked at: a queue's branch may carry its own file, and a
	// session always uses the one in the tree it runs in.
	async function checkConfig(): Promise<PreflightCheck | null> {
		if (deps.workspace.repositoryId() === null) {
			return null;
		}

		const onDefault = await deps.workspace.configOnDefault();

		return {
			name: 'config',
			ok: true,
			detail: onDefault
				? `${PROJECT_CONFIG_PATH} is on the default branch — sessions use it`
				: `no ${PROJECT_CONFIG_PATH} on the default branch yet — sessions use the draft in bosun`
		};
	}

	return {
		async collect(): Promise<PreflightCheck[]> {
			const [claude, git, gh, browser, config] = await Promise.all([
				checkClaude(),
				checkGit(),
				checkGh(),
				checkBrowser(),
				checkConfig()
			]);

			return [
				claude,
				git,
				gh,
				checkCustomMcp(),
				browser,
				checkMemory(),
				checkEnv(),
				...(config === null ? [] : [config])
			];
		}
	};
}

export type PreflightService = ReturnType<typeof getPreflightService>;
