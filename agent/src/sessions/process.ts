import { spawn } from 'child_process';
import { type ClaudeAuthService } from '../services/claude-auth.service';

// A human can sit on a question for ten minutes. The CLI's default MCP tool-call
// timeout is a minute, and `bosun_ask` blocking past it is what the whole grill
// is built on, so the cap is raised for the session rather than worked around.
const TOOL_TIMEOUT_MS = 30 * 60 * 1000;
const STARTUP_TIMEOUT_MS = 30 * 1000;
const SIGKILL_GRACE_MS = 5_000;

// Named by the caller because planning and execution want different sets:
// planning reads, execution writes. `Skill` has to appear explicitly in either —
// `--tools` replaces the built-in set, and a session without it still loads every
// skill description at startup and simply cannot invoke them, which reads to the
// model as a tool that keeps failing.
export interface SessionTools {
	builtin: string[];
	mcp: string[];
	// Defaults to everything the session was given. Named separately when the two
	// must differ — `Bash` has to be loaded for `Bash(git *)` to be allowed at all,
	// and allowing bare `Bash` alongside it would defeat the restriction.
	allowed?: string[];
}

export interface ClaudeSession {
	kill(): void;
}

function sessionArgs(opts: {
	mcpConfigPath: string;
	userServerNames: string[];
	tools: SessionTools;
}): string[] {
	// One wildcard per user server rather than an enumerated list: the tools a
	// third-party server exposes are its own business and change with its version.
	const userTools = opts.userServerNames.map((name) => `mcp__${name}__*`);

	return [
		'--print',
		'--output-format',
		'stream-json',
		'--input-format',
		'stream-json',
		'--include-partial-messages',
		'--verbose',
		'--no-session-persistence',
		'--strict-mcp-config',
		'--mcp-config',
		opts.mcpConfigPath,
		'--permission-prompts',
		'none',
		'--tools',
		opts.tools.builtin.join(','),
		'--allowed-tools',
		[...(opts.tools.allowed ?? [...opts.tools.builtin, ...opts.tools.mcp]), ...userTools].join(',')
	];
}

export function spawnClaudeSession(opts: {
	cwd: string;
	prompt: string;
	mcpConfigPath: string;
	userServerNames: string[];
	tools: SessionTools;
	claudeAuth: ClaudeAuthService;
	onStdout: (chunk: string) => void;
	onStderr: (chunk: string) => void;
	onExit: (code: number | null) => void;
}): ClaudeSession {
	// Its own process group, so cancelling reaps whatever the session spawned
	// instead of leaving a subagent holding a port and a credential.
	const child = spawn(
		'claude',
		sessionArgs({
			mcpConfigPath: opts.mcpConfigPath,
			userServerNames: opts.userServerNames,
			tools: opts.tools
		}),
		{
			cwd: opts.cwd,
			env: {
				...opts.claudeAuth.sessionEnv(),
				MCP_TOOL_TIMEOUT: String(TOOL_TIMEOUT_MS),
				MCP_TIMEOUT: String(STARTUP_TIMEOUT_MS)
			},
			detached: true,
			stdio: ['pipe', 'pipe', 'pipe']
		}
	);
	let killTimer: NodeJS.Timeout | null = null;

	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', opts.onStdout);
	child.stderr.on('data', opts.onStderr);

	child.on('error', (error) => {
		opts.onStderr(error.message);
		opts.onExit(null);
	});

	child.on('exit', (code) => {
		if (killTimer) {
			clearTimeout(killTimer);
		}

		opts.onExit(code);
	});

	// The prompt travels on stdin rather than argv: argv is world-readable through
	// /proc/<pid>/cmdline, and the pasted ticket is the user's own material.
	child.stdin.write(
		`${JSON.stringify({
			type: 'user',
			message: { role: 'user', content: [{ type: 'text', text: opts.prompt }] }
		})}\n`
	);
	child.stdin.end();

	const signalGroup = (signal: NodeJS.Signals): void => {
		try {
			process.kill(-child.pid!, signal);
		} catch {
			child.kill(signal);
		}
	};

	return {
		kill(): void {
			if (child.exitCode !== null || child.signalCode !== null) {
				return;
			}

			signalGroup('SIGTERM');
			killTimer = setTimeout(() => {
				signalGroup('SIGKILL');
			}, SIGKILL_GRACE_MS);
			killTimer.unref();
		}
	};
}
