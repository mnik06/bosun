import { spawn } from 'child_process';
import { SUPPORTED_CREDENTIAL_VARIABLES, type ClaudeCredential } from '../claude-credential';

// A human can sit on a question for ten minutes. The CLI's default MCP tool-call
// timeout is a minute, and `bosun_ask` blocking past it is what the whole grill
// is built on, so the cap is raised for the session rather than worked around.
const TOOL_TIMEOUT_MS = 30 * 60 * 1000;
const STARTUP_TIMEOUT_MS = 30 * 1000;
const SIGKILL_GRACE_MS = 5_000;

const BUILTIN_TOOLS = ['Read', 'Grep', 'Glob', 'Task'];

const MCP_TOOLS = [
	'mcp__bosun__bosun_ask',
	'mcp__bosun__create_plan',
	'mcp__bosun__add_ac',
	'mcp__bosun__create_slice'
];

export interface ClaudeSession {
	kill(): void;
}

function sessionEnv(credential: ClaudeCredential | null): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };

	// Exactly one credential reaches the session, so the mode reported at
	// preflight is the mode it authenticates with rather than whichever variable
	// the CLI happens to prefer.
	for (const variable of SUPPORTED_CREDENTIAL_VARIABLES) {
		delete env[variable];
	}

	if (credential) {
		env[credential.variable] = credential.value;
	}

	env.MCP_TOOL_TIMEOUT = String(TOOL_TIMEOUT_MS);
	env.MCP_TIMEOUT = String(STARTUP_TIMEOUT_MS);

	return env;
}

function sessionArgs(mcpConfig: string): string[] {
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
		mcpConfig,
		'--permission-prompts',
		'none',
		'--tools',
		BUILTIN_TOOLS.join(','),
		'--allowed-tools',
		[...BUILTIN_TOOLS, ...MCP_TOOLS].join(',')
	];
}

export function spawnClaudeSession(opts: {
	cwd: string;
	prompt: string;
	mcpConfig: string;
	credential: ClaudeCredential | null;
	onStdout: (chunk: string) => void;
	onStderr: (chunk: string) => void;
	onExit: (code: number | null) => void;
}): ClaudeSession {
	// Its own process group, so cancelling reaps whatever the session spawned
	// instead of leaving a subagent holding a port and a credential.
	const child = spawn('claude', sessionArgs(opts.mcpConfig), {
		cwd: opts.cwd,
		env: sessionEnv(opts.credential),
		detached: true,
		stdio: ['pipe', 'pipe', 'pipe']
	});
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
