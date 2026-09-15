import { askPrompt } from '../prompts/ask';
import { createStreamParser } from '../planning/stream-parser';
import { type AgentMsg, type LineAsk } from '../protocol';
import { type Services } from '../services/index';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { createStderrTail, logDroppedFrame, reportStartFailure } from '../sessions/turn-support';

const STDERR_KEPT_CHARS = 500;

// Read plus git, and nothing else. `Bash(git *)` rather than `Bash` is the whole
// guarantee: a session answering a question must not be able to run the project,
// touch the database, or edit a file, and a prompt saying "do not" is not a
// guarantee of anything. It stands in the read tree — a checkout of the default
// branch — and reaches every plan's branch through git.
const ASK_TOOLS = {
	builtin: ['Read', 'Grep', 'Glob', 'Bash'],
	mcp: [],
	allowed: ['Read', 'Grep', 'Glob', 'Bash(git *)']
};

interface Ask {
	repositoryId: string;
	mcp: SessionMcpServer;
	process: ClaudeSession | null;
	settled: boolean;
	answer: string;
}

export interface AskSessions {
	ask(msg: LineAsk): Promise<void>;
	cancelAll(): void;
	running(): number;
}

export function createAskSessions(opts: {
	services: Services;
	send: (message: AgentMsg) => void;
}): AskSessions {
	const asks = new Map<string, Ask>();

	const teardown = (askId: string): void => {
		const ask = asks.get(askId);

		if (!ask) {
			return;
		}

		asks.delete(askId);
		ask.process?.kill();
		void ask.mcp.close();
	};

	const settle = (askId: string, message: AgentMsg): void => {
		const ask = asks.get(askId);

		if (!ask || ask.settled) {
			return;
		}

		ask.settled = true;
		opts.send(message);
		teardown(askId);
	};

	const start = async (msg: LineAsk): Promise<void> => {
		const tree = await opts.services.repo.readTree();

		// No user servers and no bosun tools: a question needs neither, and every
		// server started here is a credential handed to a session that only had to
		// read a git log.
		const mcp = await startSessionMcpServer({
			sessionId: msg.askId,
			definitions: [],
			createDispatch: () => async (name: string) => {
				throw new Error(`unknown tool ${name}`);
			},
			log: (line) => {
				console.log(line);
			}
		});
		const ask: Ask = { repositoryId: msg.repositoryId, mcp, process: null, settled: false, answer: '' };

		asks.set(msg.askId, ask);

		const stderr = createStderrTail(STDERR_KEPT_CHARS);
		const parser = createStreamParser({
			onEvent: (event) => {
				if (event.kind === 'text') {
					ask.answer += event.delta;
					opts.send({
						type: 'line.answer.text',
						repositoryId: msg.repositoryId,
						askId: msg.askId,
						delta: event.delta
					});

					return;
				}

				if (event.kind === 'tool') {
					return;
				}

				settle(
					msg.askId,
					event.ok
						? {
							type: 'line.answer.done',
							repositoryId: msg.repositoryId,
							askId: msg.askId,
							content: ask.answer.trim()
						}
						: {
							type: 'line.answer.error',
							repositoryId: msg.repositoryId,
							askId: msg.askId,
							message: event.message
						}
				);
			},
			onDropped: logDroppedFrame
		});

		ask.process = spawnClaudeSession({
			cwd: tree.path,
			prompt: askPrompt({
				question: msg.question,
				state: msg.state,
				transcript: msg.transcript
			}),
			mcpConfigPath: mcp.configPath,
			userServerNames: [],
			tools: ASK_TOOLS,
			claudeAuth: opts.services.claudeAuth,
			onStdout: (chunk) => {
				parser.push(chunk);
			},
			onStderr: (chunk) => {
				stderr.push(chunk);
			},
			onExit: (code) => {
				parser.flush();
				// Settles only if the stream did not: an answer that arrived is the
				// answer, whatever the exit code says afterwards.
				settle(msg.askId, {
					type: 'line.answer.error',
					repositoryId: msg.repositoryId,
					askId: msg.askId,
					message: stderr.value().trim() || `claude exited with code ${code ?? 'unknown'}`
				});
			}
		});
	};

	return {
		async ask(msg): Promise<void> {
			if (asks.has(msg.askId)) {
				return;
			}

			await reportStartFailure({
				attempt: () => start(msg),
				teardown: () => {
					teardown(msg.askId);
				},
				send: (message) => {
					opts.send({
						type: 'line.answer.error',
						repositoryId: msg.repositoryId,
						askId: msg.askId,
						message
					});
				}
			});
		},

		// A question whose socket is gone has nowhere to send its answer, and the
		// browser is left with a message that never gets one.
		cancelAll(): void {
			for (const [askId, ask] of [...asks]) {
				settle(askId, {
					type: 'line.answer.error',
					repositoryId: ask.repositoryId,
					askId,
					message: 'the connection to bosun dropped before this was answered'
				});
			}
		},

		running(): number {
			return asks.size;
		}
	};
}
