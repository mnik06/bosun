import { prepareRunEnvironment } from '../execution/run-environment';
import { exitMessage } from '../execution/session';
import { type ProjectConfig } from '../project-config';
import { type AgentMsg, type QuickFixStart } from '../protocol';
import { quickFixPrompt } from '../prompts/quick-fix';
import { resolveProjectConfig } from '../services/config-resolution';
import { type Services } from '../services/index';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { createStreamParser } from '../planning/stream-parser';
import { configGate, writeEnvFiles } from '../sessions/run-support';
import { createStderrTail, logDroppedFrame, pipeSessionOutput, reportStartFailure } from '../sessions/turn-support';

const REPORT_KEPT_CHARS = 4_000;
const COMMIT_SUBJECT_CHARS = 72;

// Writes, same as a build bullet, minus everything only a plan bullet has a use
// for: no browser driving, no clarifying question, so no `Task` sub-agent needs
// a stack to hand off to and no user MCP server is loaded.
const BUILTIN_TOOLS = ['Read', 'Grep', 'Glob', 'Task', 'Skill', 'Edit', 'Write', 'Bash'];

// The description is whatever the operator pasted — a paragraph, a stack trace,
// a client's own words — so only its first line, capped, becomes the commit's
// one-line subject.
export function quickFixCommitMessage(description: string): string {
	const subject = description.trim().split('\n', 1)[0]?.trim() ?? '';

	if (subject === '') {
		return 'Quick fix';
	}

	return `Quick fix: ${subject.length > COMMIT_SUBJECT_CHARS ? `${subject.slice(0, COMMIT_SUBJECT_CHARS - 1)}…` : subject}`;
}

interface Run {
	mcp: SessionMcpServer | null;
	process: ClaudeSession | null;
	// Set only by a shutdown: there is no server frame that cancels a single quick
	// fix. It stops `startProcess` from spawning a session for a run `cancelAll`
	// already tore down while a `git worktree add` or a setup step was mid-flight.
	cancelled: boolean;
	settled: boolean;
	report: string;
	// The `.env` files bosun wrote before the session started, kept out of the commit.
	envFiles: string[];
}

export interface QuickFixSessions {
	start(msg: QuickFixStart): Promise<void>;
	cancelAll(): void;
	running(): number;
}

export function createQuickFixSessions(opts: {
	services: Services;
	send: (message: AgentMsg) => void;
}): QuickFixSessions {
	const runs = new Map<string, Run>();

	// The worktree goes with the run however it ends: a quick fix is one-shot, so
	// nothing else is ever going to ask bosun to remove it.
	const teardown = (quickFixId: string): void => {
		const run = runs.get(quickFixId);

		if (!run) {
			return;
		}

		runs.delete(quickFixId);
		run.process?.kill();
		void run.mcp?.close();
		// Caught rather than left to reject unhandled: an agent no longer attached to
		// a repository must not crash and take every other session on the machine
		// down with it over a worktree that is now moot anyway.
		void opts.services.worktree.remove(quickFixId).catch((error: unknown) => {
			console.error(`[${quickFixId}] could not remove its worktree: ${error instanceof Error ? error.message : error}`);
		});
	};

	const fail = (quickFixId: string, message: string): void => {
		const run = runs.get(quickFixId);

		if (!run || run.settled) {
			return;
		}

		run.settled = true;
		opts.send({ type: 'quickfix.error', quickFixId, message });
		teardown(quickFixId);
	};

	// The commit and push happen here rather than in the session, for the same
	// reason a plan bullet's do: a model that commits its own work leaves no
	// single sha bosun can point a pull request at.
	const finish = async (msg: QuickFixStart): Promise<void> => {
		const run = runs.get(msg.quickFixId);

		if (!run || run.settled) {
			return;
		}

		run.settled = true;

		try {
			const worktreePath = opts.services.worktree.pathFor(msg.quickFixId);
			const gate = await configGate({ exec: opts.services.exec, worktreePath, actor: 'fix' });

			if (gate !== null) {
				opts.send({ type: 'quickfix.error', quickFixId: msg.quickFixId, message: gate });

				return;
			}

			const committed = await opts.services.commit.commitAll({
				worktreePath,
				keepOut: run.envFiles,
				message: quickFixCommitMessage(msg.description)
			});

			if (!committed.ok) {
				opts.send({
					type: 'quickfix.error',
					quickFixId: msg.quickFixId,
					message: `the fix finished but could not be committed: ${committed.detail}`
				});

				return;
			}

			// Unlike a verify slice, which legitimately finds nothing to change, a quick
			// fix exists only to change something: a session that reported success but
			// left no diff could not actually find or fix the bug, and recording it as
			// pushed would tell the operator a PR is coming when nothing will ever open.
			if (committed.commitSha === null) {
				opts.send({
					type: 'quickfix.error',
					quickFixId: msg.quickFixId,
					message: 'the session ended without changing anything — it could not produce a fix'
				});

				return;
			}

			const pushed = await opts.services.commit.pushBranch({ worktreePath, branch: msg.branch });

			if (!pushed.ok) {
				console.error(`[${msg.quickFixId}] ${pushed.detail}`);
			}

			opts.send({
				type: 'quickfix.done',
				quickFixId: msg.quickFixId,
				commitSha: committed.commitSha,
				report: run.report.slice(-REPORT_KEPT_CHARS),
				changedFiles: await opts.services.commit.changedFiles({ worktreePath, sha: committed.commitSha }),
				pushed: pushed.ok,
				pushError: pushed.ok ? null : pushed.detail
			});
		} finally {
			teardown(msg.quickFixId);
		}
	};

	// A fresh worktree and branch every time: a quick fix id is used exactly once,
	// so there is never a worktree from an earlier attempt to resume. `ensure`
	// itself refuses a machine with no repository attached.
	const prepareBranch = async (msg: QuickFixStart): Promise<string> => {
		const ensured = await opts.services.worktree.ensure({ slug: msg.quickFixId });

		if (!ensured.ok) {
			throw new Error(ensured.detail);
		}

		const branched = await opts.services.commit.startBuildBranch({
			worktreePath: ensured.worktreePath,
			branch: msg.branch,
			baseRef: msg.baseRef,
			fresh: true,
			startFrom: null,
			mergeIn: []
		});

		if (!branched.ok) {
			throw new Error(branched.detail);
		}

		return ensured.worktreePath;
	};

	// Resolved from the tree the session runs in, after its branch is checked out —
	// the same rule a plan bullet follows. Null when the repository has never been
	// onboarded: the session then works out its own checks, same as it would on a
	// machine bosun has never configured.
	const prepareProject = async (
		msg: QuickFixStart,
		worktreePath: string
	): Promise<{ config: ProjectConfig | null; env: NodeJS.ProcessEnv }> => {
		const resolved = resolveProjectConfig({ treePath: worktreePath, draft: null });

		if (resolved.source === 'invalid') {
			throw new Error(resolved.detail);
		}

		const config = resolved.source === 'none' ? null : resolved.config;
		const environment = await prepareRunEnvironment({ services: opts.services, config, includeSecrets: true });

		if (!environment.ok) {
			throw new Error(environment.detail);
		}

		if (config !== null) {
			const ran = await opts.services.setupSteps.runAll({
				key: msg.quickFixId,
				worktreePath,
				config,
				env: environment.env,
				onStep: (name) => console.log(`[${msg.quickFixId}] setup step ${name}`)
			});

			if (!ran.ok) {
				throw new Error(ran.message);
			}
		}

		return { config, env: environment.env };
	};

	const startProcess = async (msg: QuickFixStart, run: Run): Promise<void> => {
		const worktreePath = await prepareBranch(msg);

		// Cancelled while the worktree was being prepared. Carrying on would start a
		// session for a run `cancelAll` has already torn down.
		if (run.cancelled) {
			return;
		}

		const written = writeEnvFiles({ projectEnv: opts.services.projectEnv, worktreePath, id: msg.quickFixId });

		run.envFiles = written.written;

		const providedEnv = written.providedEnv;
		const project = await prepareProject(msg, worktreePath);

		if (run.cancelled) {
			return;
		}

		const scope = opts.services.memory.sessionScope({
			runId: msg.quickFixId,
			memoryMaxBytes: msg.memoryMaxBytes
		});

		// The one tool a session gets for free from `startSessionMcpServer` is the
		// transport itself: a quick fix is handed no tool beyond it, because there is
		// no question to ask and no decision to record against a plan that does not
		// exist here.
		const mcp = await startSessionMcpServer({
			sessionId: msg.quickFixId,
			definitions: [],
			createDispatch: () => async (name: string) => {
				throw new Error(`${name} is not available to a quick fix`);
			}
		});

		if (run.cancelled) {
			await mcp.close();

			return;
		}

		run.mcp = mcp;

		const stderr = createStderrTail();
		const parser = createStreamParser({
			onEvent: (event) => {
				if (event.kind === 'text') {
					run.report += event.delta;

					return;
				}

				if (event.kind === 'tool') {
					return;
				}

				event.ok ? void finish(msg) : fail(msg.quickFixId, event.message);
			},
			onDropped: logDroppedFrame
		});
		const pipe = pipeSessionOutput({ parser, stderr, tag: msg.quickFixId });

		run.process = spawnClaudeSession({
			cwd: worktreePath,
			prompt: quickFixPrompt({
				description: msg.description,
				branch: msg.branch,
				baseRef: msg.baseRef,
				config: project.config,
				providedEnv
			}),
			mcpConfigPath: mcp.configPath,
			userServerNames: [],
			tools: { builtin: BUILTIN_TOOLS, mcp: [] },
			claudeAuth: opts.services.claudeAuth,
			env: project.env,
			scope,
			onOomKill: (count) => {
				console.error(`[${msg.quickFixId}] out of memory: the kernel killed a process (${count} so far)`);
			},
			onStdout: pipe.onStdout,
			onStderr: pipe.onStderr,
			onExit: (code, exit) => {
				pipe.onExit();

				// A shutdown already tore this run down and killed the process itself; its
				// own exit is not a crash to report.
				if (run.cancelled) {
					return;
				}

				fail(
					msg.quickFixId,
					exitMessage({ code, exit, stderr: stderr.value(), limitBytes: scope?.memoryMaxBytes ?? null })
				);
			}
		});
	};

	return {
		async start(msg): Promise<void> {
			if (runs.has(msg.quickFixId)) {
				return;
			}

			const run: Run = { mcp: null, process: null, cancelled: false, settled: false, report: '', envFiles: [] };

			runs.set(msg.quickFixId, run);

			await reportStartFailure({
				attempt: () => startProcess(msg, run),
				teardown: () => {
					teardown(msg.quickFixId);
				},
				send: (message) => {
					opts.send({ type: 'quickfix.error', quickFixId: msg.quickFixId, message });
				}
			});
		},

		cancelAll(): void {
			for (const run of runs.values()) {
				run.cancelled = true;
			}

			for (const quickFixId of [...runs.keys()]) {
				teardown(quickFixId);
			}
		},

		running(): number {
			return runs.size;
		}
	};
}
