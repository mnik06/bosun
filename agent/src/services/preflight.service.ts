import { type ClaudeAuthService } from './claude-auth.service';
import { type ExecService } from './exec.service';
import { type McpConfigService } from './mcp-config.service';
import { type PreflightCheck } from '../protocol';

const MIN_CLAUDE_MAJOR = 2;

export function claudeVersionIsSupported(version: string): boolean {
	// The stream-json event shape is a looser contract than a package version, so
	// a major the parser has never seen is reported rather than assumed to work.
	return Number(version.match(/(\d+)\./)?.[1] ?? 0) >= MIN_CLAUDE_MAJOR;
}

export function getPreflightService(deps: {
	exec: ExecService;
	claudeAuth: ClaudeAuthService;
	mcpConfig: McpConfigService;
	repoPath: string;
}) {
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

		const inside = await deps.exec.run(
			'git',
			['-C', deps.repoPath, 'rev-parse', '--is-inside-work-tree'],
			{}
		);

		return inside.ok && inside.stdout.trim() === 'true'
			? { name: 'git', ok: true, detail: `${version.stdout} · ${deps.repoPath}` }
			: { name: 'git', ok: false, detail: `${deps.repoPath} is not a git repository` };
	}

	// `gh auth status` is the whole check: bosun holds no GitHub credential of its
	// own, so what matters is whether the CLI on this box has one. Never red —
	// queues run fine without it, they simply cannot open a pull request, and a
	// machine used only for building should not look broken for that.
	async function checkGh(): Promise<PreflightCheck> {
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

	return {
		async collect(): Promise<PreflightCheck[]> {
			const [claude, git, gh] = await Promise.all([checkClaude(), checkGit(), checkGh()]);

			return [claude, git, gh, checkCustomMcp()];
		}
	};
}

export type PreflightService = ReturnType<typeof getPreflightService>;
