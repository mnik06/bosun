import { type ChatAttachment } from '../chat-attachment';
import { type AgentConfig } from '../config/config';
import { type AgentMsg, type PlanAnswer, type PlanQuestion, type PlanSnapshot } from '../protocol';
import { type SessionImage } from '../services/attachments.service';
import { resolveProjectConfig } from '../services/config-resolution';
import { type ReadTree } from '../services/repo.service';
import { type Services } from '../services/index';
import { serveTree, type ServedTree } from '../services/static-server.service';
import { createActivityTracker } from './activity-labels';
import { createPlanDispatch, TOOL_DEFINITIONS } from './mcp/tools';
import {
	startSessionMcpServer,
	type SessionDispatchFactory,
	type SessionMcpServer
} from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { teardownSession } from '../sessions/teardown';
import { createStderrTail, logDroppedFrame, pipeSessionOutput, reportStartFailure } from '../sessions/turn-support';
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

// Twice, not once. The first prod is regularly answered with another turn of
// thinking that ends the same way, and a session told twice what its exits are
// has had the chance a person would give it. Past that, prodding is arguing.
const MAX_NUDGES = 2;

// The whole life of a session, mid-grill or warm. A grill waits on a person, and
// a person is entitled to go home and answer in the morning — so nothing shorter
// can be a timeout without the session dying under somebody who is still using
// it. What ends a session earlier is the plan being confirmed, which is a
// `plan.cancel` from the backend.
const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const REAP_SWEEP_MS = 60 * 1000;

interface Session {
	mcp: SessionMcpServer;
	served: ServedTree | null;
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
	nudges: number;
	requireGrill: boolean;
	// Every message the person sends, in the order it arrived. Frames are routed
	// concurrently and a turn waits on its files, so without this a line typed
	// after a screenshot could reach the session before it.
	turns: Promise<void>;
}

export interface PlanningSessions {
	start(opts: {
		planId: string;
		input: string;
		verifyInUi: boolean;
		auto: boolean;
		notes: string | null;
		configDraft: string | null;
	}): Promise<void>;
	held(): string[];
	say(opts: {
		planId: string;
		text: string;
		attachments: ChatAttachment[];
		notes: string | null;
		configDraft: string | null;
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
		tree: ReadTree;
		served: string | null;
	}) => string;
	revisionPrompt: (opts: {
		plan: PlanSnapshot;
		request: string;
		notes: string | null;
		tree: ReadTree;
		served: string | null;
	}) => string;
}): PlanningSessions {
	const sessions = new Map<string, Session>();

	const teardown = (planId: string): void => {
		const session = sessions.get(planId);

		teardownSession(sessions, planId);
		void session?.served?.close();
		opts.services.attachments.release(planId);
	};

	// A server that will not start costs the session one convenience, not the grill.
	const serveFor = async (planId: string, tree: ReadTree): Promise<ServedTree | null> => {
		try {
			return await serveTree(tree.path);
		} catch (error) {
			console.error(`[${planId}] could not serve ${tree.path}: ${error instanceof Error ? error.message : 'unknown error'}`);

			return null;
		}
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

	// A turn that ends without an outcome is nudged rather than reported as
	// finished: the backend fails an empty plan, and the session is still up and
	// able to produce one. Capped, because past a couple of prods it is arguing.
	const settle = (planId: string): void => {
		const session = sessions.get(planId);

		if (!session) {
			return;
		}

		if (session.published || session.nudges >= MAX_NUDGES || !session.process) {
			done(planId);

			return;
		}

		const nudge = nudgeFor(session);

		session.nudges += 1;
		opts.send({ type: 'plan.activity', planId, label: nudge.label });
		session.process.send(nudge.text);
	};

	// Which prod a stalled turn gets. A plan session mid-grill must not be told to
	// publish — `publish_plan` refuses in that state, so the nudge would only spend a
	// turn being refused.
	const nudgeFor = (session: Session): { label: string; text: string } => {
		return session.requireGrill && !session.grilled
			? { label: 'Asking the session to keep grilling', text: UNGRILLED_NUDGE }
			: { label: 'Asking the session to publish', text: UNPUBLISHED_NUDGE };
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

	// Fetched and resolved per session rather than once at connect: a machine can
	// hold a socket for days, and what `origin/HEAD` pointed at when it connected
	// is exactly the staleness this exists to remove.
	//
	// A repository machine's notes come from the config in the tree it reads — the
	// file when the default branch has one, the draft otherwise. A file that does
	// not validate stops the session here, before it plans against a config nobody
	// can run. Null means the session was refused and the plan already failed.
	const readTree = async (
		planId: string,
		project: { notes: string | null; configDraft: string | null }
	): Promise<{ tree: ReadTree; notes: string | null } | null> => {
		opts.send({ type: 'plan.activity', planId, label: 'Fetching the latest changes' });

		let tree: ReadTree;

		try {
			tree = await opts.services.repo.readTree();
		} catch (error) {
			opts.send({ type: 'plan.error', planId, message: error instanceof Error ? error.message : 'could not read the repository' });

			return null;
		}

		console.log(`[${planId}] reading ${tree.path}: ${tree.detail}`);

		if (!tree.fresh) {
			opts.send({
				type: 'plan.activity',
				planId,
				label: `Reading the machine checkout — ${tree.detail}`
			});
		}

		if (opts.services.workspace.repositoryId() === null) {
			return { tree, notes: project.notes };
		}

		const resolved = resolveProjectConfig({ treePath: tree.path, draft: project.configDraft });

		if (resolved.source === 'invalid') {
			opts.send({ type: 'plan.error', planId, message: resolved.detail });

			return null;
		}

		return { tree, notes: resolved.source === 'none' ? project.notes : resolved.config.notes ?? project.notes };
	};

	const startProcess = async (opts2: {
		planId: string;
		prompt: string;
		images: SessionImage[];
		cwd: string;
		served: ServedTree | null;
		published: boolean;
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
			userServers: userMcp.servers
		});
		const session: Session = {
			mcp,
			served: opts2.served,
			process: null,
			cancelled: false,
			startedAt: Date.now(),
			idleAt: null,
			published: opts2.published,
			grilled: false,
			nudges: 0,
			requireGrill: opts2.requireGrill,
			turns: Promise.resolve()
		};

		sessions.set(planId, session);
		opts.send({ type: 'plan.activity', planId, label: 'Starting the session' });

		const activity = createActivityTracker();
		const stderr = createStderrTail();
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
			onDropped: logDroppedFrame
		});

		const pipe = pipeSessionOutput({ parser, stderr, tag: planId });

		session.process = spawnClaudeSession({
			cwd: opts2.cwd,
			prompt,
			images: opts2.images,
			addDirs: [opts.services.attachments.root()],
			mcpConfigPath: mcp.configPath,
			userServerNames: userMcp.serverNames,
			tools: opts2.tools,
			claudeAuth: opts.services.claudeAuth,
			onStdout: pipe.onStdout,
			onStderr: pipe.onStderr,
			onExit: (code) => {
				pipe.onExit();

				if (session.cancelled) {
					return;
				}

				// A session that already produced a result has published; exiting after
				// that is the process being reaped, not the grill dying. Only an exit
				// before the first result leaves a plan stuck in `planning`.
				if (session.idleAt !== null) {
					sessions.delete(planId);
					void session.mcp.close();
					void session.served?.close();
					opts.services.attachments.release(planId);

					return;
				}

				fail(planId, stderr.value().trim() || `claude exited with code ${code ?? 'unknown'}`);
			}
		});
	};

	const spawnFor = async (payload: Parameters<typeof startProcess>[0]): Promise<void> => {
		await reportStartFailure({
			attempt: () => startProcess(payload),
			// Closed here as well: a start that failed before the session was
			// registered left nothing for the teardown to find.
			teardown: () => {
				teardown(payload.planId);
				void payload.served?.close();
			},
			send: (message) => {
				opts.send({ type: 'plan.error', planId: payload.planId, message });
			}
		});
	};

	// What `start` and a fresh `say` share once the tree is read: serve it, build
	// the prompt against wherever it ended up served, and spawn. `buildPrompt`
	// takes the served URL rather than the prompt taking it directly, because the
	// two callers' prompts are built by entirely different services and this is
	// the only shape both can be handed through. `published`, `requireGrill`,
	// `requireCoverage` and `auto` are where a fresh grill and a revision
	// genuinely differ, so those stay arguments rather than being folded in here.
	const launchPlanning = async (payload: {
		planId: string;
		tree: ReadTree;
		buildPrompt: (served: string | null) => string;
		images: SessionImage[];
		published: boolean;
		requireGrill: boolean;
		requireCoverage: boolean;
		auto: boolean;
	}): Promise<void> => {
		const served = await serveFor(payload.planId, payload.tree);

		await spawnFor({
			planId: payload.planId,
			prompt: payload.buildPrompt(served?.url ?? null),
			images: payload.images,
			cwd: payload.tree.path,
			served,
			published: payload.published,
			requireGrill: payload.requireGrill,
			tools: PLANNING_TOOLS,
			definitions: TOOL_DEFINITIONS,
			createDispatch: createPlanDispatch({
				planId: payload.planId,
				auto: payload.auto,
				requireGrill: payload.requireGrill,
				requireCoverage: payload.requireCoverage,
				bosunApi: opts.services.bosunApi,
				onPublished: onPublished(payload.planId),
				onGrilled: onGrilled(payload.planId),
				onQuestion: onQuestion(payload.planId)
			})
		});
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

			const read = await readTree(payload.planId, payload);

			if (read === null) {
				return;
			}

			const { tree, notes } = read;

			await launchPlanning({
				planId: payload.planId,
				tree,
				buildPrompt: (served) =>
					opts.prompt({
						input: payload.input,
						verifyInUi: payload.verifyInUi,
						auto: payload.auto,
						notes,
						tree,
						served
					}),
				images: [],
				published: false,
				requireGrill: !payload.auto,
				requireCoverage: true,
				auto: payload.auto
			});
		},

		// Named on every `hello` so the backend can tell a session that outlived a
		// reconnect from one that died with the agent process. Everything it has
		// marked `planning` and this does not name has nothing left to finish it.
		held(): string[] {
			return [...sessions.keys()];
		},

		// Delivered to the session that is already up whenever there is one, so the
		// person is talking to something that remembers the grill. Otherwise the
		// plan travels on the frame and a revision session starts from it.
		async say(payload): Promise<void> {
			const session = sessions.get(payload.planId);
			const stage = async () =>
				opts.services.attachments.stageTurn({ key: payload.planId, text: payload.text, attachments: payload.attachments });

			if (session?.process) {
				session.idleAt = null;
				session.turns = session.turns
					.then(async () => {
						const turn = await stage();

						// Torn down while the files were fetched: the plan was confirmed or
						// the session failed, and neither leaves anything to deliver to.
						if (sessions.get(payload.planId) === session) {
							session.process?.send(turn.text, turn.images);
						}
					})
					.catch((error: unknown) => {
						console.error(`[${payload.planId}] could not deliver a message: ${error instanceof Error ? error.message : String(error)}`);
					});

				await session.turns;

				return;
			}

			const read = await readTree(payload.planId, payload);

			if (read === null) {
				return;
			}

			const { tree, notes } = read;

			if (payload.attachments.length > 0) {
				opts.send({ type: 'plan.activity', planId: payload.planId, label: 'Fetching the attached files' });
			}

			const turn = await stage();

			await launchPlanning({
				planId: payload.planId,
				tree,
				buildPrompt: (served) =>
					opts.revisionPrompt({
						plan: payload.plan,
						request: turn.text,
						notes,
						tree,
						served
					}),
				images: turn.images,
				// A revision is handed a plan that is already written, so a turn that
				// changes nothing is a legitimate answer rather than an empty plan.
				published: payload.plan.bodyMd !== null,
				// A revision edits a plan that was already grilled into existence, and
				// a plan that was never published has nothing to revise — the person
				// asked for a change in prose, which is the decision the grill exists to
				// get.
				requireGrill: false,
				requireCoverage: false,
				// A revision of an auto plan still answers itself: the snapshot carries
				// the flag, because the agent holds no plan state between sessions.
				auto: payload.plan.auto
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
