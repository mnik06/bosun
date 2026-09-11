import { createActivityTracker } from '../planning/activity-labels';
import { createStreamParser } from '../planning/stream-parser';
import { executionPrompt } from '../prompts/execution';
import { verifyPrompt } from '../prompts/verify';
import { type AgentMsg, type ExecStart, type PlanAnswer } from '../protocol';
import { type Services } from '../services/index';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { commitMessageFor } from './commit';
import { createExecutionDispatch, executionDefinitions, executionMcpTools } from './mcp/tools';

const STDERR_KEPT_CHARS = 500;
const REPORT_KEPT_CHARS = 4_000;

// Execution writes. Planning's set is deliberately not reused here: the whole
// difference between the two halves of the product is that one may change the
// repository and the other may not.
const EXECUTION_BUILTIN_TOOLS = ['Read', 'Grep', 'Glob', 'Task', 'Skill', 'Edit', 'Write', 'Bash'];

// A verify bullet orchestrates: its own sub-agents do the reading and the fixing,
// and it drives a browser through whatever MCP servers the machine has.
const VERIFY_BUILTIN_TOOLS = [...EXECUTION_BUILTIN_TOOLS, 'ToolSearch'];

function promptFor(msg: ExecStart): string {
	const shared = {
		planNumber: msg.planNumber,
		planTitle: msg.planTitle,
		planBodyMd: msg.planBodyMd,
		branch: msg.branch,
		baseRef: msg.baseRef,
		worktreePath: msg.worktreePath,
		profile: msg.profile,
		portBase: msg.portBase,
		afk: msg.afk,
		decisions: msg.decisions,
		planAcs: msg.planAcs,
		sliceOrdinal: msg.slice.ordinal,
		sliceTitle: msg.slice.title,
		sliceBodyMd: msg.slice.bodyMd,
		doneSlices: msg.doneSlices
	};

	return msg.slice.kind === 'verify'
		? verifyPrompt(shared)
		: executionPrompt({ ...shared, sliceKind: msg.slice.kind, acs: msg.acs });
}

interface Run {
	// Null while the bullet is being set up. The run is in the map before either
	// exists, because `hello` reads this map to say what this agent still holds:
	// a run missing from it is one the backend puts back and pauses the queue over,
	// and the setup below can take a `git fetch` and a worktree reset to finish.
	mcp: SessionMcpServer | null;
	process: ClaudeSession | null;
	cancelled: boolean;
	settled: boolean;
	report: string;
}

export interface ExecutionSessions {
	start(msg: ExecStart): Promise<void>;
	answer(opts: { runId: string; questionId: string; answers: PlanAnswer[] }): void;
	cancel(runId: string): void;
	cancelAll(): void;
	running(): number;
	held(): string[];
}

export function createExecutionSessions(opts: {
	services: Services;
	send: (message: AgentMsg) => void;
}): ExecutionSessions {
	const runs = new Map<string, Run>();

	const teardown = (runId: string): void => {
		const run = runs.get(runId);

		if (!run) {
			return;
		}

		runs.delete(runId);
		run.process?.kill();
		void run.mcp?.close();
	};

	const fail = (runId: string, message: string): void => {
		const run = runs.get(runId);

		if (!run || run.settled) {
			return;
		}

		run.settled = true;
		opts.send({ type: 'exec.error', runId, message });
		teardown(runId);
	};

	// The commit happens here rather than in the session, because a model that
	// commits its own work splits the history bosun is keeping and there is then
	// no single sha to record against the slice.
	const finish = async (msg: ExecStart): Promise<void> => {
		const run = runs.get(msg.runId);

		if (!run || run.settled) {
			return;
		}

		run.settled = true;

		const committed = await opts.services.commit.commitAll({
			worktreePath: msg.worktreePath,
			message: commitMessageFor({
				planTitle: msg.planTitle,
				sliceOrdinal: msg.slice.ordinal,
				sliceTitle: msg.slice.title
			})
		});

		if (!committed.ok) {
			opts.send({
				type: 'exec.error',
				runId: msg.runId,
				message: `the bullet finished but could not be committed: ${committed.detail}`
			});
			teardown(msg.runId);

			return;
		}

		opts.send({
			type: 'exec.done',
			runId: msg.runId,
			commitSha: committed.commitSha,
			report: run.report.slice(-REPORT_KEPT_CHARS)
		});
		teardown(msg.runId);
	};

	const startProcess = async (msg: ExecStart, run: Run): Promise<void> => {
		if (msg.freshBranch) {
			const branched = await opts.services.commit.startBranch({
				worktreePath: msg.worktreePath,
				branch: msg.branch,
				baseRef: msg.baseRef
			});

			if (!branched.ok) {
				throw new Error(branched.detail);
			}
		} else {
			const cleaned = await opts.services.commit.cleanTree({
				worktreePath: msg.worktreePath,
				branch: msg.branch
			});

			if (!cleaned.ok) {
				throw new Error(`could not clean the worktree: ${cleaned.detail}`);
			}
		}

		// Cancelled while the worktree was being prepared. Carrying on would start a
		// session for a bullet the backend has already taken back.
		if (run.cancelled) {
			return;
		}

		const userMcp = opts.services.mcpConfig.read();

		if (userMcp.error) {
			console.error(`custom mcp config ignored: ${userMcp.error}`);
		}

		const mcp = await startSessionMcpServer({
			sessionId: msg.runId,
			definitions: executionDefinitions({ afk: msg.afk, verify: msg.slice.kind === 'verify' }),
			createDispatch: createExecutionDispatch({
				afk: msg.afk,
				planId: msg.planId,
				sliceId: msg.sliceId,
				bosunApi: opts.services.bosunApi,
				onQuestion: ({ questionId, questions }) => {
					opts.send({ type: 'exec.question', runId: msg.runId, questionId, questions });
				}
			}),
			userServers: userMcp.servers,
			log: (line) => {
				console.log(line);
			}
		});
		if (run.cancelled) {
			await mcp.close();

			return;
		}

		run.mcp = mcp;
		opts.send({ type: 'exec.activity', runId: msg.runId, label: 'Starting the session' });

		const activity = createActivityTracker();
		let stderr = '';
		const parser = createStreamParser({
			onEvent: (event) => {
				if (event.kind === 'text') {
					run.report += event.delta;
					opts.send({ type: 'exec.text', runId: msg.runId, delta: event.delta });

					return;
				}

				if (event.kind === 'tool') {
					opts.send({
						type: 'exec.activity',
						runId: msg.runId,
						label: activity.label({ tool: event.name, subagent: event.subagent })
					});

					return;
				}

				event.ok ? void finish(msg) : fail(msg.runId, event.message);
			},
			onDropped: (line) => {
				console.error(`dropped unrecognised claude frame: ${line.slice(0, 200)}`);
			}
		});

		run.process = spawnClaudeSession({
			cwd: msg.worktreePath,
			prompt: promptFor(msg),
			mcpConfigPath: mcp.configPath,
			userServerNames: userMcp.serverNames,
			tools: {
				builtin: msg.slice.kind === 'verify' ? VERIFY_BUILTIN_TOOLS : EXECUTION_BUILTIN_TOOLS,
				mcp: executionMcpTools({ afk: msg.afk, verify: msg.slice.kind === 'verify' })
			},
			claudeAuth: opts.services.claudeAuth,
			onStdout: (chunk) => {
				parser.push(chunk);
			},
			onStderr: (chunk) => {
				stderr = `${stderr}${chunk}`.slice(-STDERR_KEPT_CHARS);
				console.error(`[${msg.runId}] ${chunk.trimEnd()}`);
			},
			onExit: (code) => {
				parser.flush();

				if (run.cancelled) {
					return;
				}

				fail(msg.runId, stderr.trim() || `claude exited with code ${code ?? 'unknown'}`);
			}
		});
	};

	return {
		async start(msg): Promise<void> {
			if (runs.has(msg.runId)) {
				return;
			}

			// Before the first await, so a reconnect that lands while the worktree is
			// still being prepared finds this run in `held()`. Without it the backend
			// reads a bullet it dispatched seconds ago as one that died with the old
			// socket, puts it back, and pauses the queue — while the session it was
			// told nothing about goes on to start and build.
			const run: Run = {
				mcp: null,
				process: null,
				cancelled: false,
				settled: false,
				report: ''
			};

			runs.set(msg.runId, run);

			try {
				await startProcess(msg, run);
			} catch (error) {
				teardown(msg.runId);
				opts.send({
					type: 'exec.error',
					runId: msg.runId,
					message: error instanceof Error ? error.message : 'could not start the session'
				});
			}
		},

		answer(payload): void {
			runs.get(payload.runId)?.mcp?.answer(payload);
		},

		cancel(runId): void {
			const run = runs.get(runId);

			if (run) {
				run.cancelled = true;
				teardown(runId);
			}
		},

		cancelAll(): void {
			for (const runId of [...runs.keys()]) {
				this.cancel(runId);
			}
		},

		running(): number {
			return runs.size;
		},

		// The runs this agent still holds a session for. Sent on `hello` so the
		// backend can tell a bullet that survived a reconnect from one that died
		// with the connection before it and has to be put back.
		held(): string[] {
			return [...runs.keys()];
		}
	};
}
