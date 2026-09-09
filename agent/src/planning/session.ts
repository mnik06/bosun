import { type AgentConfig } from '../config/config';
import { type AgentMsg, type PlanAnswer, type PlanSnapshot } from '../protocol';
import { type Services } from '../services/index';
import { createActivityTracker } from './activity-labels';
import { createPlanDispatch, TOOL_DEFINITIONS } from './mcp/tools';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { createStreamParser } from './stream-parser';

// Planning reads and asks; it never writes to the repository.
const PLANNING_TOOLS = {
	builtin: ['Read', 'Grep', 'Glob', 'Task', 'Skill'],
	mcp: [
		'mcp__bosun__bosun_ask',
		'mcp__bosun__list_plans',
		'mcp__bosun__name_plan',
		'mcp__bosun__set_blockers',
		'mcp__bosun__publish_plan'
	]
};

const STDERR_KEPT_CHARS = 500;

// A published session is kept alive so the next thing the person types continues
// the same conversation rather than re-reading the repository from nothing. It
// is a `claude` process holding memory, so it does not stay forever: past this,
// the next message starts a revision session with the plan handed to it.
const IDLE_REAP_MS = 30 * 60 * 1000;
const REAP_SWEEP_MS = 60 * 1000;

interface Session {
	mcp: SessionMcpServer;
	process: ClaudeSession | null;
	cancelled: boolean;
	// A turn finished. The session stays up for follow-ups, and this is when it
	// went quiet — a session mid-grill has never settled and is never reaped.
	idleAt: number | null;
}

export interface PlanningSessions {
	start(opts: {
		planId: string;
		input: string;
		verifyInUi: boolean;
		auto: boolean;
		notes: string | null;
	}): Promise<void>;
	say(opts: {
		planId: string;
		text: string;
		notes: string | null;
		plan: PlanSnapshot;
	}): Promise<void>;
	answer(opts: { planId: string; questionId: string; answers: PlanAnswer[] }): void;
	cancel(planId: string): void;
	cancelAll(): void;
	running(): number;
}

export function createPlanningSessions(opts: {
	config: AgentConfig;
	services: Services;
	send: (message: AgentMsg) => void;
	prompt: (opts: {
		input: string;
		verifyInUi: boolean;
		auto: boolean;
		notes: string | null;
	}) => string;
	revisionPrompt: (opts: {
		plan: PlanSnapshot;
		request: string;
		notes: string | null;
	}) => string;
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

	// A finished turn is not a finished session: the plan is announced as done and
	// the process is left running, so the next thing the person types is answered
	// by the session that wrote the plan rather than by a stranger.
	const done = (planId: string): void => {
		const session = sessions.get(planId);

		if (!session) {
			return;
		}

		session.idleAt = Date.now();
		opts.send({ type: 'plan.done', planId });
	};

	const fail = (planId: string, message: string): void => {
		if (!sessions.has(planId)) {
			return;
		}

		opts.send({ type: 'plan.error', planId, message });
		teardown(planId);
	};

	const startProcess = async (planId: string, prompt: string, auto: boolean): Promise<void> => {
		const userMcp = opts.services.mcpConfig.read();

		if (userMcp.error) {
			console.error(`custom mcp config ignored: ${userMcp.error}`);
		}

		const mcp = await startSessionMcpServer({
			sessionId: planId,
			definitions: TOOL_DEFINITIONS,
			createDispatch: createPlanDispatch({
				planId,
				auto,
				bosunApi: opts.services.bosunApi,
				onQuestion: ({ questionId, questions, autoAnswers }) => {
					opts.send({ type: 'plan.question', planId, questionId, questions, autoAnswers });
				}
			}),
			userServers: userMcp.servers,
			log: (line) => {
				console.log(line);
			}
		});
		const session: Session = { mcp, process: null, cancelled: false, idleAt: null };

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

				event.ok ? done(planId) : fail(planId, event.message);
			},
			onDropped: (line) => {
				console.error(`dropped unrecognised claude frame: ${line.slice(0, 200)}`);
			}
		});

		session.process = spawnClaudeSession({
			cwd: opts.config.repoPath,
			prompt,
			mcpConfigPath: mcp.configPath,
			userServerNames: userMcp.serverNames,
			tools: PLANNING_TOOLS,
			claudeAuth: opts.services.claudeAuth,
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

				// A session that already produced a result has published; exiting after
				// that is the process being reaped, not the grill dying. Only an exit
				// before the first result leaves a plan stuck in `planning`.
				if (session.idleAt !== null) {
					sessions.delete(planId);
					void session.mcp.close();

					return;
				}

				fail(planId, stderr.trim() || `claude exited with code ${code ?? 'unknown'}`);
			}
		});
	};

	const spawnFor = async (planId: string, prompt: string, auto: boolean): Promise<void> => {
		try {
			await startProcess(planId, prompt, auto);
		} catch (error) {
			teardown(planId);
			opts.send({
				type: 'plan.error',
				planId,
				message: error instanceof Error ? error.message : 'could not start the session'
			});
		}
	};

	const reaper = setInterval(() => {
		const deadline = Date.now() - IDLE_REAP_MS;

		for (const [planId, session] of sessions) {
			if (session.idleAt !== null && session.idleAt < deadline) {
				teardown(planId);
			}
		}
	}, REAP_SWEEP_MS);

	reaper.unref();

	return {
		async start(payload): Promise<void> {
			if (sessions.has(payload.planId)) {
				return;
			}

			await spawnFor(
				payload.planId,
				opts.prompt({
					input: payload.input,
					verifyInUi: payload.verifyInUi,
					auto: payload.auto,
					notes: payload.notes
				}),
				payload.auto
			);
		},

		// Delivered to the session that is already up whenever there is one, so the
		// person is talking to something that remembers the grill. Otherwise the
		// plan travels on the frame and a revision session starts from it.
		async say(payload): Promise<void> {
			const session = sessions.get(payload.planId);

			if (session?.process) {
				session.idleAt = null;
				session.process.send(payload.text);

				return;
			}

			// A revision of an auto plan is still an auto plan: the snapshot carries the
			// flag, because the agent holds no plan state between sessions.
			await spawnFor(
				payload.planId,
				opts.revisionPrompt({
					plan: payload.plan,
					request: payload.text,
					notes: payload.notes
				}),
				payload.plan.auto
			);
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
			clearInterval(reaper);

			for (const planId of [...sessions.keys()]) {
				this.cancel(planId);
			}
		},

		running(): number {
			return sessions.size;
		}
	};
}
