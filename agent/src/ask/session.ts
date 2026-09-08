import { askPrompt } from '../prompts/ask';
import { createStreamParser } from '../planning/stream-parser';
import { type AgentMsg, type QueueAsk } from '../protocol';
import { type Services } from '../services/index';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';

const STDERR_KEPT_CHARS = 500;

// Read plus git, and nothing else. `Bash(git *)` rather than `Bash` is the whole
// guarantee: a session answering a question must not be able to run the project,
// touch the database, or edit a file, and a prompt saying "do not" is not a
// guarantee of anything.
const ASK_TOOLS = {
	builtin: ['Read', 'Grep', 'Glob', 'Bash'],
	mcp: [],
	allowed: ['Read', 'Grep', 'Glob', 'Bash(git *)']
};

interface Ask {
	queueId: string;
	mcp: SessionMcpServer;
	process: ClaudeSession | null;
	settled: boolean;
	answer: string;
}

export interface AskSessions {
	ask(msg: QueueAsk): Promise<void>;
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

	const start = async (msg: QueueAsk): Promise<void> => {
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
		const ask: Ask = { queueId: msg.queueId, mcp, process: null, settled: false, answer: '' };

		asks.set(msg.askId, ask);

		let stderr = '';
		const parser = createStreamParser({
			onEvent: (event) => {
				if (event.kind === 'text') {
					ask.answer += event.delta;
					opts.send({
						type: 'queue.answer.text',
						queueId: msg.queueId,
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
							type: 'queue.answer.done',
							queueId: msg.queueId,
							askId: msg.askId,
							content: ask.answer.trim()
						}
						: {
							type: 'queue.answer.error',
							queueId: msg.queueId,
							askId: msg.askId,
							message: event.message
						}
				);
			},
			onDropped: (line) => {
				console.error(`dropped unrecognised claude frame: ${line.slice(0, 200)}`);
			}
		});

		ask.process = spawnClaudeSession({
			cwd: msg.worktreePath,
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
				stderr = `${stderr}${chunk}`.slice(-STDERR_KEPT_CHARS);
			},
			onExit: (code) => {
				parser.flush();
				// Settles only if the stream did not: an answer that arrived is the
				// answer, whatever the exit code says afterwards.
				settle(msg.askId, {
					type: 'queue.answer.error',
					queueId: msg.queueId,
					askId: msg.askId,
					message: stderr.trim() || `claude exited with code ${code ?? 'unknown'}`
				});
			}
		});
	};

	return {
		async ask(msg): Promise<void> {
			if (asks.has(msg.askId)) {
				return;
			}

			try {
				await start(msg);
			} catch (error) {
				teardown(msg.askId);
				opts.send({
					type: 'queue.answer.error',
					queueId: msg.queueId,
					askId: msg.askId,
					message: error instanceof Error ? error.message : 'could not start the session'
				});
			}
		},

		// A question whose socket is gone has nowhere to send its answer, and the
		// browser is left with a message that never gets one.
		cancelAll(): void {
			for (const [askId, ask] of [...asks]) {
				settle(askId, {
					type: 'queue.answer.error',
					queueId: ask.queueId,
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
