import { createActivityTracker } from '../planning/activity-labels';
import { createStreamParser } from '../planning/stream-parser';
import { bugfixOrchestratorPrompt } from '../prompts/bugfix';
import { type AgentMsg, type BugfixSay, type BugfixStart } from '../protocol';
import { type Services } from '../services/index';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { createStderrTail, logDroppedFrame, pipeSessionOutput, reportStartFailure } from '../sessions/turn-support';
import { BUGFIX_MCP_TOOLS, BUGFIX_TOOL_DEFINITIONS, createBugfixDispatch } from './mcp/tools';

const STDERR_KEPT_CHARS = 500;

// Fixes, so it gets execution's write set rather than planning's read-only one —
// but no `stack_up`: the person already tested the running product themselves,
// and this session works from the worktree alone. See `prompts/bugfix.ts`.
const BUGFIX_BUILTIN_TOOLS = ['Read', 'Grep', 'Glob', 'Task', 'Skill', 'Edit', 'Write', 'Bash'];

interface Entry {
	buildId: string;
	worktreePath: string;
	branch: string;
	planTitle: string;
	process: ClaudeSession | null;
	mcp: SessionMcpServer | null;
	cancelled: boolean;
	// A round finished and nothing new has arrived since. The process stays up —
	// a later message continues it — but it is doing nothing, on the same terms
	// `running()` excludes an idle planning session for.
	idle: boolean;
	// The start, then every later message, in the order they arrived — see the
	// same field on a planning session. A say that lands while the first turn's
	// files are still downloading waits for the process instead of being told
	// there is none.
	turns: Promise<void>;
}

export interface BugfixSessions {
	start(msg: BugfixStart): Promise<void>;
	say(msg: BugfixSay): void;
	cancel(sessionId: string): void;
	cancelAll(): void;
	held(): string[];
	running(): number;
	// Ends every session that is only warm, not mid-round, before the binary is
	// swapped: those `claude` processes are detached and would otherwise survive
	// the upgrade orphaned. Unlike planning's, ending one here still means
	// something is live in `bugfix_sessions` on the backend, so each is reported
	// as an error rather than just dropped — the machine's own idle sweep would
	// eventually notice, but there is no reason to make the person wait for it.
	endIdle(): void;
}

// One live `claude` per build's bug-fixing session, kept warm across rounds the
// same way a planning session is: a person pastes more bugs into the same chat
// later, and that is another turn on this same process, not a new one. Unlike
// planning, nothing here ever resolves the backend's own idea of "this session
// is live" — `bugfix_sessions.status` stays `running` until the backend closes
// it (a person's "Done", a merge, a cancel, or its own idle sweep) — so every
// way this process can stop reports back rather than just going quiet.
export function createBugfixSessions(opts: { services: Services; send: (message: AgentMsg) => void }): BugfixSessions {
	const { services } = opts;
	const entries = new Map<string, Entry>();

	const teardown = (sessionId: string): void => {
		const entry = entries.get(sessionId);

		entries.delete(sessionId);
		entry?.process?.kill();
		void entry?.mcp?.close();
		services.attachments.release(sessionId);
	};

	const fail = (opts2: { sessionId: string; buildId: string; message: string }): void => {
		if (!entries.has(opts2.sessionId)) {
			return;
		}

		opts.send({ type: 'bugfix.error', sessionId: opts2.sessionId, buildId: opts2.buildId, message: opts2.message });
		teardown(opts2.sessionId);
	};

	// The commit happens here, never in the session: a model that commits its own
	// work is the one thing every other session type in this codebase refuses to
	// let happen, because it splits the history bosun is keeping. Pushed after
	// every round, not only once — a provider waiting on this branch sees each
	// fix as it lands rather than only the last one.
	const settle = async (opts2: { sessionId: string; buildId: string }): Promise<void> => {
		const entry = entries.get(opts2.sessionId);

		if (!entry) {
			return;
		}

		const committed = await services.commit.commitAll({
			worktreePath: entry.worktreePath,
			message: `${entry.planTitle} — bug fixes`
		});

		if (!committed.ok) {
			fail({ sessionId: opts2.sessionId, buildId: opts2.buildId, message: `this round finished but could not be committed: ${committed.detail}` });

			return;
		}

		if (committed.commitSha !== null) {
			const pushed = await services.commit.pushBranch({ worktreePath: entry.worktreePath, branch: entry.branch });

			if (!pushed.ok) {
				console.error(`[${opts2.sessionId}] ${pushed.detail}`);
			}
		}

		entry.idle = true;
		opts.send({ type: 'bugfix.done', sessionId: opts2.sessionId, buildId: opts2.buildId });
	};

	const startProcess = async (msg: BugfixStart, entry: Entry): Promise<void> => {
		if (msg.attachments.length > 0) {
			opts.send({ type: 'bugfix.activity', sessionId: msg.sessionId, buildId: msg.buildId, label: 'Fetching the attached files' });
		}

		const turn = await services.attachments.stageTurn({ key: msg.sessionId, text: msg.text, attachments: msg.attachments });

		// Cancelled while the files were fetched. Spawning now would leave a
		// `claude` running that nothing holds a handle to.
		if (entry.cancelled) {
			services.attachments.release(msg.sessionId);

			return;
		}

		const mcp = await startSessionMcpServer({
			sessionId: msg.sessionId,
			definitions: BUGFIX_TOOL_DEFINITIONS,
			createDispatch: createBugfixDispatch({ sessionId: msg.sessionId, buildId: msg.buildId, bosunApi: services.bosunApi })
		});

		entry.mcp = mcp;
		opts.send({ type: 'bugfix.activity', sessionId: msg.sessionId, buildId: msg.buildId, label: 'Starting the session' });

		const activity = createActivityTracker();
		const stderr = createStderrTail(STDERR_KEPT_CHARS);
		const parser = createStreamParser({
			onEvent: (event) => {
				if (event.kind === 'text') {
					opts.send({ type: 'bugfix.text', sessionId: msg.sessionId, buildId: msg.buildId, delta: event.delta });

					return;
				}

				if (event.kind === 'tool') {
					opts.send({
						type: 'bugfix.activity',
						sessionId: msg.sessionId,
						buildId: msg.buildId,
						label: activity.label({ tool: event.name, subagent: event.subagent })
					});

					return;
				}

				event.ok
					? void settle({ sessionId: msg.sessionId, buildId: msg.buildId })
					: fail({ sessionId: msg.sessionId, buildId: msg.buildId, message: event.message });
			},
			onDropped: logDroppedFrame
		});
		const pipe = pipeSessionOutput({ parser, stderr, tag: msg.sessionId });

		entry.process = spawnClaudeSession({
			cwd: msg.worktreePath,
			prompt: bugfixOrchestratorPrompt({
				planNumber: msg.planNumber,
				planTitle: msg.planTitle,
				planBodyMd: msg.planBodyMd,
				branch: msg.branch,
				worktreePath: msg.worktreePath,
				acs: msg.acs,
				text: turn.text
			}),
			images: turn.images,
			addDirs: [services.attachments.root()],
			mcpConfigPath: mcp.configPath,
			userServerNames: [],
			tools: { builtin: BUGFIX_BUILTIN_TOOLS, mcp: BUGFIX_MCP_TOOLS },
			claudeAuth: services.claudeAuth,
			onStdout: pipe.onStdout,
			onStderr: pipe.onStderr,
			onExit: (code) => {
				pipe.onExit();

				if (entry.cancelled) {
					return;
				}

				// Whether this is a first-turn startup failure or the process crashing
				// after an earlier round, the backend's row is still `running` and has
				// to be told either way — nothing else will notice this process is gone.
				fail({
					sessionId: msg.sessionId,
					buildId: msg.buildId,
					message: stderr.value().trim() || `claude exited with code ${code ?? 'unknown'}`
				});
			}
		});
	};

	return {
		async start(msg): Promise<void> {
			if (entries.has(msg.sessionId)) {
				return;
			}

			const entry: Entry = {
				buildId: msg.buildId,
				worktreePath: msg.worktreePath,
				branch: msg.branch,
				planTitle: msg.planTitle,
				process: null,
				mcp: null,
				cancelled: false,
				idle: false,
				turns: Promise.resolve()
			};

			entries.set(msg.sessionId, entry);
			entry.turns = reportStartFailure({
				attempt: () => startProcess(msg, entry),
				teardown: () => {
					teardown(msg.sessionId);
				},
				send: (message) => {
					opts.send({ type: 'bugfix.error', sessionId: msg.sessionId, buildId: msg.buildId, message });
				}
			});

			await entry.turns;
		},

		say(msg): void {
			const entry = entries.get(msg.sessionId);
			const gone = (): void => {
				opts.send({
					type: 'bugfix.error',
					sessionId: msg.sessionId,
					buildId: msg.buildId,
					message: 'this bug-fixing session is no longer running on this machine'
				});
			};

			if (!entry) {
				gone();

				return;
			}

			entry.idle = false;
			entry.turns = entry.turns
				.then(async () => {
					const turn = await services.attachments.stageTurn({ key: msg.sessionId, text: msg.text, attachments: msg.attachments });

					if (entries.get(msg.sessionId) !== entry || !entry.process) {
						gone();

						return;
					}

					entry.process.send(turn.text, turn.images);
				})
				.catch((error: unknown) => {
					console.error(`[${msg.sessionId}] could not deliver a message: ${error instanceof Error ? error.message : String(error)}`);
				});
		},

		cancel(sessionId): void {
			const entry = entries.get(sessionId);

			if (entry) {
				entry.cancelled = true;
				teardown(sessionId);
			}
		},

		cancelAll(): void {
			for (const sessionId of [...entries.keys()]) {
				this.cancel(sessionId);
			}
		},

		held(): string[] {
			return [...entries.keys()];
		},

		running(): number {
			return [...entries.values()].filter((entry) => !entry.idle).length;
		},

		endIdle(): void {
			for (const [sessionId, entry] of entries) {
				if (entry.idle) {
					fail({ sessionId, buildId: entry.buildId, message: 'this machine is restarting for an upgrade' });
				}
			}
		}
	};
}
