import { spawn } from 'child_process';
import fs from 'fs';
import { type ClaudeAuthService } from '../services/claude-auth.service';
import {
	memoryEventsPath,
	parseOomKills,
	scopedCommand,
	type SessionScope
} from '../services/memory.service';
import { killProcessGroup } from '../utils';

// A person is not obliged to answer within the working day. The CLI's default
// MCP tool-call timeout is a minute, and `bosun_ask` blocking past it is what the
// whole grill is built on, so the cap is raised to the session's own lifetime
// rather than worked around. Anything shorter resolves the call with `The
// operation timed out.` and the model carries on as though the person had refused
// to answer — which is where a repeated question and a plan written without a
// grill both come from.
const TOOL_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const STARTUP_TIMEOUT_MS = 30 * 1000;

// A tracker issue fetched with every field — the only fetch that includes the
// custom fields acceptance criteria live in — runs past the CLI's 25,000-token
// default, and past it the result is swapped for a file path the session has to
// read back in pieces, which is where half a ticket's criteria went missing.
const MCP_OUTPUT_TOKENS = 100_000;
const SIGKILL_GRACE_MS = 5_000;

// Often enough to read a kill while the scope still exists. It is removed with
// its last process, and a count that was only ever going to be read after that is
// a kill nobody hears about.
const OOM_POLL_MS = 2_000;

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
	// Another user turn on the same session. The CLI reads stream-json from stdin
	// until it closes, so a session stays answerable instead of ending with its
	// first result.
	send(text: string): void;
}

// How the process ended beyond its exit code. `oomKills` counts every process the
// kernel killed inside the session's scope for going over its limit: `claude`
// itself when `signal` is `SIGKILL`, otherwise a command it ran.
export interface SessionExit {
	signal: NodeJS.Signals | null;
	oomKills: number;
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
	// Laid over the credential environment: the toolchain's PATH, a repository's
	// session secrets, and git settings that keep a session from pushing.
	env?: NodeJS.ProcessEnv;
	// A systemd scope of its own, under its own memory limit. Without one the
	// session runs inside the agent's unit, where the kernel killing anything for
	// memory can stop the agent and every other session with it.
	scope?: SessionScope | null;
	onOomKill?: (count: number) => void;
	onStdout: (chunk: string) => void;
	onStderr: (chunk: string) => void;
	onExit: (code: number | null, exit: SessionExit) => void;
}): ClaudeSession {
	const args = sessionArgs({
		mcpConfigPath: opts.mcpConfigPath,
		userServerNames: opts.userServerNames,
		tools: opts.tools
	});
	const command = opts.scope
		? scopedCommand({ scope: opts.scope, command: 'claude', args })
		: { command: 'claude', args };
	// Its own process group, so cancelling reaps whatever the session spawned
	// instead of leaving a subagent holding a port and a credential.
	const child = spawn(command.command, command.args, {
		cwd: opts.cwd,
		env: {
			...opts.claudeAuth.sessionEnv(),
			...opts.env,
			MCP_TOOL_TIMEOUT: String(TOOL_TIMEOUT_MS),
			MCP_TIMEOUT: String(STARTUP_TIMEOUT_MS),
			MAX_MCP_OUTPUT_TOKENS: String(MCP_OUTPUT_TOKENS),
			// In print mode a sub-agent runs in the background unless the model asks
			// otherwise, and a session that ends its turn waiting on one is settled at
			// that `result` — the reviewer's findings, and every tick after them, never
			// happen. Foreground is the only mode a turn-scoped session can wait on.
			CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'
		},
		detached: true,
		stdio: ['pipe', 'pipe', 'pipe']
	});
	let killTimer: NodeJS.Timeout | null = null;
	let oomKills = 0;
	let eventsPath: string | null = null;

	const readOomKills = (): void => {
		if (!opts.scope || child.pid === undefined) {
			return;
		}

		try {
			eventsPath ??= memoryEventsPath({
				cgroup: fs.readFileSync(`/proc/${child.pid}/cgroup`, 'utf8'),
				unit: opts.scope.unit
			});

			if (eventsPath === null) {
				return;
			}

			const count = parseOomKills(fs.readFileSync(eventsPath, 'utf8'));

			if (count > oomKills) {
				oomKills = count;
				opts.onOomKill?.(count);
			}
		} catch {
			// The scope went with its last process, or the pid with the process. What
			// was counted before then stands.
		}
	};
	const oomPoll = opts.scope ? setInterval(readOomKills, OOM_POLL_MS) : null;

	oomPoll?.unref();

	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', opts.onStdout);
	child.stderr.on('data', opts.onStderr);

	child.on('error', (error) => {
		if (oomPoll) {
			clearInterval(oomPoll);
		}

		opts.onStderr(error.message);
		opts.onExit(null, { signal: null, oomKills });
	});

	child.on('exit', (code, signal) => {
		if (killTimer) {
			clearTimeout(killTimer);
		}

		if (oomPoll) {
			clearInterval(oomPoll);
		}

		// Once more before reporting: the kill that ended `claude` lands between
		// polls, and the scope outlives it for as long as anything it started does.
		readOomKills();
		opts.onExit(code, { signal, oomKills });
	});

	const write = (text: string): void => {
		if (child.stdin.writable) {
			child.stdin.write(
				`${JSON.stringify({
					type: 'user',
					message: { role: 'user', content: [{ type: 'text', text }] }
				})}\n`
			);
		}
	};

	// The prompt travels on stdin rather than argv: argv is world-readable through
	// /proc/<pid>/cmdline, and the pasted ticket is the user's own material. stdin
	// is deliberately left open — closing it ends the session after one turn.
	write(opts.prompt);

	const signalGroup = (signal: NodeJS.Signals): void => killProcessGroup(child, signal);

	return {
		send: write,

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
