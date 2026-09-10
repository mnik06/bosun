import { type AgentConfig } from '../config/config';
import {
	type AgentMsg,
	type PlanAnswer,
	type PlanQuestion,
	type PlanSnapshot,
	type PreparePlan
} from '../protocol';
import { type Services } from '../services/index';
import { createActivityTracker } from './activity-labels';
import {
	createPlanDispatch,
	createPrepareDispatch,
	PREPARE_TOOL_DEFINITIONS,
	TOOL_DEFINITIONS
} from './mcp/tools';
import {
	startSessionMcpServer,
	type SessionDispatchFactory,
	type SessionMcpServer
} from '../sessions/mcp-server';
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

const PREPARATION_TOOLS = {
	builtin: PLANNING_TOOLS.builtin,
	mcp: [
		'mcp__bosun__bosun_ask',
		'mcp__bosun__list_plans',
		'mcp__bosun__name_plan',
		'mcp__bosun__publish_plan',
		'mcp__bosun__republish_plan',
		'mcp__bosun__set_plan_blockers',
		'mcp__bosun__abandon_preparation'
	]
};

const STDERR_KEPT_CHARS = 500;

// Sent once when a turn ends with nothing published. The failure it addresses is
// always the same: the session spawned subagents, decided their work was still
// running somewhere, and ended its turn to wait for a report that is never
// coming. Saying so is what turns the retry into a plan instead of a repeat.
const UNPUBLISHED_NUDGE = [
	'Your turn ended without calling publish_plan, so nothing was written and this plan is still empty.',
	'Subagent results arrive inside the turn that spawned them — nothing is running in the background and no report is on its way.',
	'Publish the plan now with what you already know, or ask with bosun_ask if you genuinely cannot proceed without an answer.'
].join(' ');

// The same failure before the grill has happened, where the nudge above would be
// telling it to do the one thing it must not: write the plan from its own first
// draft. `publish_plan` refuses in this state anyway, so a nudge to publish would
// only spend a turn being refused.
const UNGRILLED_NUDGE = [
	'Your turn ended with nothing published and no question waiting, so this session is doing nothing and the plan is still empty.',
	'Subagent results arrive inside the turn that spawned them — nothing is running in the background and no report is on its way.',
	'The grill has not started: ask the next question now with bosun_ask, one question, and keep going until the decisions are settled.'
].join(' ');

// The whole life of a session, mid-grill or warm. A grill waits on a person, and
// a person is entitled to go home and answer in the morning — so nothing shorter
// can be a timeout without the session dying under somebody who is still using
// it. What ends a session earlier is the plan being confirmed, which is a
// `plan.cancel` from the backend.
const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const REAP_SWEEP_MS = 60 * 1000;

interface Session {
	mcp: SessionMcpServer;
	process: ClaudeSession | null;
	cancelled: boolean;
	startedAt: number;
	// A turn finished. The session stays up for follow-ups, and this is when it
	// went quiet — a session mid-grill has never settled.
	idleAt: number | null;
	// Whether a plan has actually been written. A revision starts true, because
	// the plan it was handed is already published.
	published: boolean;
	// Whether a `bosun_ask` question has been answered. What separates a plan the
	// person shaped from one the model wrote for itself.
	grilled: boolean;
	nudged: boolean;
	// Off for a preparation session: publishing nothing is a legitimate outcome
	// there, and nudging one that decided the plans share nothing would argue with
	// the answer it was asked for.
	nudge: boolean;
	requireGrill: boolean;
	// Set by `abandon_preparation`. Recorded rather than acted on inside the tool
	// so the call returns before the process is torn down under it.
	abandonedReason: string | null;
}

export interface PlanningSessions {
	start(opts: {
		planId: string;
		input: string;
		verifyInUi: boolean;
		auto: boolean;
		notes: string | null;
	}): Promise<void>;
	held(): string[];
	prepare(opts: {
		planId: string;
		planNumber: number;
		plans: PreparePlan[];
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
	endIdle(): void;
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
	preparationPrompt: (opts: {
		planNumber: number;
		plans: PreparePlan[];
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

	// A turn that ends without a published plan is nudged once rather than reported
	// as finished: the backend fails an empty plan, and the session is still up and
	// able to write one. Only once — a second would be arguing with it.
	const settle = (planId: string): void => {
		const session = sessions.get(planId);

		if (!session) {
			return;
		}

		// A preparation that found nothing to share ends as a failure with the reason
		// it gave, rather than as an empty plan nobody can read an answer off.
		if (session.abandonedReason !== null) {
			fail(planId, session.abandonedReason);

			return;
		}

		if (session.published || session.nudged || !session.nudge || !session.process) {
			done(planId);

			return;
		}

		const ungrilled = session.requireGrill && !session.grilled;

		session.nudged = true;
		opts.send({
			type: 'plan.activity',
			planId,
			label: ungrilled ? 'Asking the session to keep grilling' : 'Asking the session to publish'
		});
		session.process.send(ungrilled ? UNGRILLED_NUDGE : UNPUBLISHED_NUDGE);
	};

	const fail = (planId: string, message: string): void => {
		if (!sessions.has(planId)) {
			return;
		}

		opts.send({ type: 'plan.error', planId, message });
		teardown(planId);
	};

	// Read off the map rather than closed over: the session object does not exist
	// when a dispatch is built, and by the time a tool can fire it is registered.
	const onPublished = (planId: string) => (): void => {
		const current = sessions.get(planId);

		if (current) {
			current.published = true;
		}
	};

	const onAbandoned = (planId: string) => (reason: string): void => {
		const current = sessions.get(planId);

		if (current) {
			current.abandonedReason = reason;
		}
	};

	const onGrilled = (planId: string) => (): void => {
		const current = sessions.get(planId);

		if (current) {
			current.grilled = true;
		}
	};

	const onQuestion =
		(planId: string) =>
			({
				questionId,
				questions,
				autoAnswers
			}: {
				questionId: string;
				questions: PlanQuestion[];
				autoAnswers?: PlanAnswer[];
			}): void => {
				opts.send({ type: 'plan.question', planId, questionId, questions, autoAnswers });
			};

	const startProcess = async (opts2: {
		planId: string;
		prompt: string;
		published: boolean;
		nudge: boolean;
		requireGrill: boolean;
		tools: { builtin: string[]; mcp: string[] };
		definitions: unknown[];
		createDispatch: SessionDispatchFactory;
	}): Promise<void> => {
		const { planId, prompt } = opts2;
		const userMcp = opts.services.mcpConfig.read();

		if (userMcp.error) {
			console.error(`custom mcp config ignored: ${userMcp.error}`);
		}

		const mcp = await startSessionMcpServer({
			sessionId: planId,
			definitions: opts2.definitions,
			createDispatch: opts2.createDispatch,
			userServers: userMcp.servers,
			log: (line) => {
				console.log(line);
			}
		});
		const session: Session = {
			mcp,
			process: null,
			cancelled: false,
			startedAt: Date.now(),
			idleAt: null,
			published: opts2.published,
			grilled: false,
			nudged: false,
			nudge: opts2.nudge,
			requireGrill: opts2.requireGrill,
			abandonedReason: null
		};

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

				event.ok ? settle(planId) : fail(planId, event.message);
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
			tools: opts2.tools,
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

	const spawnFor = async (payload: Parameters<typeof startProcess>[0]): Promise<void> => {
		try {
			await startProcess(payload);
		} catch (error) {
			teardown(payload.planId);
			opts.send({
				type: 'plan.error',
				planId: payload.planId,
				message: error instanceof Error ? error.message : 'could not start the session'
			});
		}
	};

	// The only clock a session answers to. A settled one is torn down quietly — its
	// plan is written and the next message starts a revision session from it — but
	// one still mid-grill has a plan row sitting in `planning`, and tearing it down
	// without saying so is what leaves a chat rendering a question nobody is
	// listening for.
	const reaper = setInterval(() => {
		const deadline = Date.now() - SESSION_MAX_MS;

		for (const [planId, session] of sessions) {
			if (session.startedAt >= deadline) {
				continue;
			}

			session.idleAt === null
				? fail(planId, 'this planning session reached its 24-hour limit and was ended')
				: teardown(planId);
		}
	}, REAP_SWEEP_MS);

	reaper.unref();

	return {
		async start(payload): Promise<void> {
			if (sessions.has(payload.planId)) {
				return;
			}

			await spawnFor({
				planId: payload.planId,
				prompt: opts.prompt({
					input: payload.input,
					verifyInUi: payload.verifyInUi,
					auto: payload.auto,
					notes: payload.notes
				}),
				published: false,
				nudge: true,
				requireGrill: !payload.auto,
				tools: PLANNING_TOOLS,
				definitions: TOOL_DEFINITIONS,
				createDispatch: createPlanDispatch({
					planId: payload.planId,
					auto: payload.auto,
					requireGrill: !payload.auto,
					bosunApi: opts.services.bosunApi,
					onPublished: onPublished(payload.planId),
					onGrilled: onGrilled(payload.planId),
					onQuestion: onQuestion(payload.planId)
				})
			});
		},

		// Named on every `hello` so the backend can tell a session that outlived a
		// reconnect from one that died with the agent process. Everything it has
		// marked `planning` and this does not name has nothing left to finish it.
		held(): string[] {
			return [...sessions.keys()];
		},

		// One session, three outputs: its own plan, the selected plans rewritten
		// without the shared work, and the blockers that hold them until it lands.
		// All three here because this is the only moment one reader has every plan
		// in front of it — split across sessions, the second re-derives days later
		// from a diff what this one already knew.
		async prepare(payload): Promise<void> {
			if (sessions.has(payload.planId)) {
				return;
			}

			await spawnFor({
				planId: payload.planId,
				prompt: opts.preparationPrompt({
					planNumber: payload.planNumber,
					plans: payload.plans,
					notes: payload.notes
				}),
				published: false,
				nudge: false,
				requireGrill: false,
				tools: PREPARATION_TOOLS,
				definitions: PREPARE_TOOL_DEFINITIONS,
				createDispatch: createPrepareDispatch({
					planId: payload.planId,
					plans: payload.plans,
					bosunApi: opts.services.bosunApi,
					onPublished: onPublished(payload.planId),
					onAbandoned: onAbandoned(payload.planId),
					onQuestion: onQuestion(payload.planId)
				})
			});
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

			await spawnFor({
				planId: payload.planId,
				prompt: opts.revisionPrompt({
					plan: payload.plan,
					request: payload.text,
					notes: payload.notes
				}),
				// A revision is handed a plan that is already written, so a turn that
				// changes nothing is a legitimate answer rather than an empty plan.
				published: payload.plan.bodyMd !== null,
				nudge: true,
				// A revision edits a plan that was already grilled into existence, and
				// a plan that was never published has nothing to revise — the person
				// asked for a change in prose, which is the decision the grill exists to
				// get.
				requireGrill: false,
				tools: PLANNING_TOOLS,
				definitions: TOOL_DEFINITIONS,
				createDispatch: createPlanDispatch({
					planId: payload.planId,
					// A revision of an auto plan is still an auto plan: the snapshot
					// carries the flag, because the agent holds no plan state between
					// sessions.
					auto: payload.plan.auto,
					requireGrill: false,
					bosunApi: opts.services.bosunApi,
					onPublished: onPublished(payload.planId),
					onGrilled: onGrilled(payload.planId),
					onQuestion: onQuestion(payload.planId)
				})
			});
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

		// Only the ones mid-turn. A settled session is still in the map on purpose —
		// it holds a warm `claude` so a follow-up continues the same conversation —
		// but it is doing nothing, and counting it told the upgrade path that work
		// was in flight for the rest of the session's life after every grill, and for
		// good after one whose process hung. An upgrade somebody asked for outranks a
		// warm cache.
		running(): number {
			return [...sessions.values()].filter((session) => session.idleAt === null).length;
		},

		// Ends the settled ones and leaves anything mid-turn alone. Called before the
		// binary is swapped: those processes are detached, so exiting without this
		// orphans a `claude` per idle session.
		endIdle(): void {
			for (const [planId, session] of sessions) {
				if (session.idleAt !== null) {
					teardown(planId);
				}
			}
		}
	};
}
