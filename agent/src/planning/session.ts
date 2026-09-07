import { resolveClaudeCredential } from '../claude-credential';
import { type AgentConfig } from '../config';
import { type AgentMsg, type PlanAnswer } from '../protocol';
import { startSessionMcpServer, type SessionMcpServer } from './mcp';
import { spawnClaudeSession, type ClaudeSession } from './process';
import { createActivityTracker, createStreamParser } from './stream';

const STDERR_KEPT_CHARS = 500;

interface Session {
	mcp: SessionMcpServer;
	process: ClaudeSession | null;
	cancelled: boolean;
	settled: boolean;
}

export interface PlanningSessions {
	start(opts: { planId: string; input: string }): Promise<void>;
	answer(opts: { planId: string; questionId: string; answers: PlanAnswer[] }): void;
	cancel(planId: string): void;
	cancelAll(): void;
}

export function createPlanningSessions(opts: {
	config: AgentConfig;
	send: (message: AgentMsg) => void;
	prompt: (input: string) => string;
}): PlanningSessions {
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

	const settle = (planId: string, message: AgentMsg): void => {
		const session = sessions.get(planId);

		if (!session || session.settled) {
			return;
		}

		session.settled = true;
		opts.send(message);
		teardown(planId);
	};

	const fail = (planId: string, message: string): void => {
		settle(planId, { type: 'plan.error', planId, message });
	};

	const startProcess = async (planId: string, input: string): Promise<void> => {
		// May be null, and that is a supported setup: a machine logged in with
		// `claude auth login` has no credential in its environment and the CLI
		// authenticates from its own store. Preflight is what establishes that the
		// box can authenticate at all, and the backend refuses to start a session
		// when that check is red.
		const credential = resolveClaudeCredential(process.env);
		const mcp = await startSessionMcpServer({
			planId,
			config: opts.config,
			onQuestion: ({ questionId, questions }) => {
				opts.send({ type: 'plan.question', planId, questionId, questions });
			},
			log: (line) => {
				console.log(line);
			}
		});
		const session: Session = { mcp, process: null, cancelled: false, settled: false };

		sessions.set(planId, session);
		opts.send({ type: 'plan.activity', planId, label: 'Starting the session' });

		const activity = createActivityTracker();
		let stderr = '';
		const parser = createStreamParser({
			onEvent: (event) => {
				if (event.kind === 'text') {
					opts.send({ type: 'plan.text', planId, delta: event.delta });

					return;
				}

				if (event.kind === 'tool') {
					opts.send({
						type: 'plan.activity',
						planId,
						label: activity.label({ tool: event.name, subagent: event.subagent })
					});

					return;
				}

				event.ok ? settle(planId, { type: 'plan.done', planId }) : fail(planId, event.message);
			},
			onDropped: (line) => {
				console.error(`dropped unrecognised claude frame: ${line.slice(0, 200)}`);
			}
		});

		session.process = spawnClaudeSession({
			cwd: opts.config.repoPath,
			prompt: opts.prompt(input),
			mcpConfig: mcp.config,
			credential,
			onStdout: (chunk) => {
				parser.push(chunk);
			},
			onStderr: (chunk) => {
				stderr = `${stderr}${chunk}`.slice(-STDERR_KEPT_CHARS);
				console.error(`[${planId}] ${chunk.trimEnd()}`);
			},
			onExit: (code) => {
				parser.flush();

				if (session.cancelled) {
					return;
				}

				// An exit without a `result` frame is the process dying under the grill —
				// the plan has to be told, or it sits in `planning` forever.
				fail(planId, stderr.trim() || `claude exited with code ${code ?? 'unknown'}`);
			}
		});
	};

	return {
		async start(payload): Promise<void> {
			if (sessions.has(payload.planId)) {
				return;
			}

			try {
				await startProcess(payload.planId, payload.input);
			} catch (error) {
				teardown(payload.planId);
				opts.send({
					type: 'plan.error',
					planId: payload.planId,
					message: error instanceof Error ? error.message : 'could not start the session'
				});
			}
		},

		answer(payload): void {
			sessions.get(payload.planId)?.mcp.answer(payload);
		},

		cancel(planId): void {
			const session = sessions.get(planId);

			if (session) {
				session.cancelled = true;
				teardown(planId);
			}
		},

		cancelAll(): void {
			for (const planId of [...sessions.keys()]) {
				this.cancel(planId);
			}
		}
	};
}
