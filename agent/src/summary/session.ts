import { type AgentConfig } from '../config/config';
import { type ServerMsg } from '../protocol';
import { type Services } from '../services/index';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { createStreamParser } from '../planning/stream-parser';
import { createSummaryDispatch, SUMMARY_TOOL_DEFINITIONS } from './mcp/tools';

type Summarize = Extract<ServerMsg, { type: 'queue.summarize' }>;

// Reads the branch and nothing else. `Bash` is loaded so `Bash(git *)` can be
// allowed at all — the CLI cannot allow a constrained form of a tool it was not
// given — and bare `Bash` is deliberately absent from the allow list, so the
// session can read history and diffs and can run nothing else.
const SUMMARY_TOOLS = {
	builtin: ['Read', 'Grep', 'Glob', 'Bash'],
	mcp: ['mcp__bosun__publish_summary'],
	allowed: ['Read', 'Grep', 'Glob', 'Bash(git *)', 'mcp__bosun__publish_summary']
};

const STDERR_KEPT_CHARS = 300;

interface Session {
	mcp: SessionMcpServer;
	process: ClaudeSession | null;
}

export interface SummarySessions {
	start(msg: Summarize): Promise<void>;
	cancelAll(): void;
}

// Nothing is reported to the browser from here. The summary reaches it the way
// every other plan change does — the backend announces the row once the tool
// writes it — and a failed summary is a log line rather than a failure anybody
// is shown, because the branch and its pull request are already delivered.
export function createSummarySessions(opts: {
	config: AgentConfig;
	services: Services;
	prompt: (opts: {
		planTitle: string;
		planBodyMd: string;
		branch: string;
		baseRef: string;
	}) => string;
}): SummarySessions {
	const sessions = new Map<string, Session>();

	const teardown = (planId: string): void => {
		const session = sessions.get(planId);

		if (!session) {
			return;
		}

		sessions.delete(planId);
		session.process?.kill();
		void session.mcp.close();
	};

	const startProcess = async (msg: Summarize): Promise<void> => {
		const mcp = await startSessionMcpServer({
			sessionId: `summary-${msg.planId}`,
			definitions: SUMMARY_TOOL_DEFINITIONS,
			createDispatch: createSummaryDispatch({
				planId: msg.planId,
				bosunApi: opts.services.bosunApi
			}),
			log: (line) => {
				console.log(line);
			}
		});
		const session: Session = { mcp, process: null };

		sessions.set(msg.planId, session);

		let stderr = '';
		const parser = createStreamParser({
			onEvent: (event) => {
				if (event.kind === 'result') {
					if (!event.ok) {
						console.error(`summary for ${msg.planId} failed: ${event.message}`);
					}

					teardown(msg.planId);
				}
			},
			onDropped: () => {}
		});

		session.process = spawnClaudeSession({
			// The worktree, not the machine's checkout: the branch only exists here.
			cwd: msg.worktreePath,
			prompt: opts.prompt({
				planTitle: msg.planTitle,
				planBodyMd: msg.planBodyMd,
				branch: msg.branch,
				baseRef: msg.baseRef
			}),
			mcpConfigPath: mcp.configPath,
			userServerNames: [],
			tools: SUMMARY_TOOLS,
			claudeAuth: opts.services.claudeAuth,
			onStdout: (chunk) => {
				parser.push(chunk);
			},
			onStderr: (chunk) => {
				stderr = `${stderr}${chunk}`.slice(-STDERR_KEPT_CHARS);
			},
			onExit: (code) => {
				parser.flush();

				if (sessions.has(msg.planId)) {
					console.error(
						`summary for ${msg.planId} ended without publishing: ${stderr.trim() || `exit ${code ?? 'unknown'}`}`
					);
					teardown(msg.planId);
				}
			}
		});
	};

	return {
		async start(msg): Promise<void> {
			// A re-run summarises the branch as it now is, so the older session is
			// reading a diff nobody is going to look at.
			teardown(msg.planId);

			try {
				await startProcess(msg);
			} catch (error) {
				console.error(
					`could not start the summary for ${msg.planId}: ${
						error instanceof Error ? error.message : 'unknown error'
					}`
				);
				teardown(msg.planId);
			}
		},

		cancelAll(): void {
			for (const planId of [...sessions.keys()]) {
				teardown(planId);
			}
		}
	};
}
