import path from 'path';
import { createActivityTracker } from '../planning/activity-labels';
import { createStreamParser } from '../planning/stream-parser';
import { drivePrompt } from '../prompts/drive';
import { executionPrompt } from '../prompts/execution';
import { fixPrompt } from '../prompts/fix';
import { type RunContext, type RunMode } from '../prompts/shared';
import { type ProjectConfig } from '../project-config';
import { type AgentMsg, type ExecStart, type PlanAnswer } from '../protocol';
import { resolveProjectConfig } from '../services/config-resolution';
import { type Services } from '../services/index';
import { formatGib, type SessionScope } from '../services/memory.service';
import { runShell } from '../services/setup-steps.service';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession, type SessionExit } from '../sessions/process';
import { configGate, writeEnvFiles } from '../sessions/run-support';
import { createStderrTail, logDroppedFrame, reportStartFailure } from '../sessions/turn-support';
import { commitMessageFor, mergeBranches } from './commit';
import {
	createExecutionDispatch,
	executionDefinitions,
	executionMcpTools,
	type ExecutionPhase,
	type SessionStack
} from './mcp/tools';
import { prepareRunEnvironment } from './run-environment';

const STDERR_KEPT_CHARS = 500;
const REPORT_KEPT_CHARS = 4_000;
const TAIL_KEPT_CHARS = 1_500;

// Execution writes. Planning's set is deliberately not reused here: the whole
// difference between the two halves of the product is that one may change the
// repository and the other may not.
const EXECUTION_BUILTIN_TOOLS = ['Read', 'Grep', 'Glob', 'Task', 'Skill', 'Edit', 'Write', 'Bash'];

// A drive changes nothing and commissions nothing: it reads, runs the odd command,
// and drives a browser through whatever MCP servers the machine has.
const LANE_BUILTIN_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Skill', 'ToolSearch'];

interface Project {
	// Null on a machine with no repository, and on a repository that has no config
	// yet: both run on the profile, as every machine did before configs existed.
	config: ProjectConfig | null;
	// Null lets the session inherit the credential environment unchanged.
	env: NodeJS.ProcessEnv | undefined;
	repository: boolean;
}

function phaseOf(msg: ExecStart): ExecutionPhase {
	return msg.phase ?? 'build';
}

function modeOf(msg: ExecStart): RunMode {
	if (msg.phase === 'drive' || msg.phase === 'recheck') {
		return 'lane';
	}

	return msg.phase === 'fix' ? 'fix' : 'build';
}

function promptFor(opts: {
	msg: ExecStart;
	providedEnv: { path: string; keys: string[] }[];
	project: Project;
	sessionSecrets: string[];
}): string {
	const { msg } = opts;
	const mode = modeOf(msg);
	const shared: RunContext = {
		mode,
		planNumber: msg.planNumber,
		planTitle: msg.planTitle,
		planBodyMd: msg.planBodyMd,
		branch: msg.branch,
		baseRef: msg.baseRef,
		worktreePath: msg.worktreePath,
		profile: msg.profile,
		config: opts.project.config,
		applyMigrations: msg.policy?.applyMigrations ?? msg.profile.applyMigrations,
		sessionSecrets: opts.sessionSecrets,
		portBase: msg.portBase,
		afk: msg.afk,
		decisions: msg.decisions,
		amendments: msg.amendments,
		planAcs: msg.planAcs,
		providedEnv: opts.providedEnv
	};

	if (mode === 'lane') {
		return drivePrompt({ ...shared, recheckCodes: msg.phase === 'recheck' ? msg.recheckCodes : [] });
	}

	if (mode === 'fix') {
		return fixPrompt({ ...shared, findings: msg.findings, fixAgain: msg.recheckCodes.length > 0 });
	}

	return executionPrompt({
		...shared,
		sliceOrdinal: msg.slice.ordinal,
		sliceKind: msg.slice.kind,
		sliceTitle: msg.slice.title,
		sliceBodyMd: msg.slice.bodyMd,
		acs: msg.acs,
		doneSlices: msg.doneSlices,
		answer: msg.answer
	});
}

// A session the kernel killed for memory exits the way a crash does — nothing on
// stderr, no exit code — and "claude exited with code unknown" sends the operator
// looking in the wrong place. The scope's own counter is what tells them apart.
export function exitMessage(opts: {
	code: number | null;
	exit: SessionExit;
	stderr: string;
	limitBytes: number | null;
}): string {
	const said = opts.stderr.trim() || `claude exited with code ${opts.code ?? 'unknown'}`;

	if (opts.exit.oomKills === 0) {
		return said;
	}

	const limit = opts.limitBytes === null ? '' : ` of ${formatGib(opts.limitBytes)}`;

	if (opts.exit.signal === 'SIGKILL') {
		return `the bullet ran out of memory: the kernel killed its session at its limit${limit}`;
	}

	const commands = opts.exit.oomKills === 1 ? 'a command' : `${opts.exit.oomKills} commands`;

	return `${said} (${commands} in this bullet ran out of memory at its limit${limit})`;
}

interface Run {
	// Null while the session is being set up. The run is in the map before either
	// exists, because `hello` reads this map to say what this agent still holds:
	// a run missing from it is one the backend puts back, and the setup below can
	// take a `git fetch`, provider merges and a database reset to finish.
	mcp: SessionMcpServer | null;
	process: ClaudeSession | null;
	cancelled: boolean;
	settled: boolean;
	report: string;
	// The `.env` files written before the session started, kept out of the commit.
	envFiles: string[];
	repository: boolean;
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

	// The stack goes with the session however the session ends. A session that dies
	// mid-browser-pass would otherwise leave its apps holding the build's ports and
	// the memory the next session is admitted against.
	const teardown = (runId: string): void => {
		const run = runs.get(runId);

		if (!run) {
			return;
		}

		runs.delete(runId);
		run.process?.kill();
		void run.mcp?.close();
		void opts.services.stack.down(runId);
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

	// A lane session keeps nothing: what a drive left behind must not reach the fix
	// session's commit, and a finding is a row, not a file.
	const finishLane = async (msg: ExecStart, run: Run): Promise<void> => {
		await opts.services.commit.discardChanges(msg.worktreePath);
		opts.send({
			type: 'exec.done',
			runId: msg.runId,
			commitSha: null,
			report: run.report.slice(-REPORT_KEPT_CHARS),
			changedFiles: [],
			pushed: false,
			pushError: null
		});
	};

	// The commit happens here rather than in the session, because a model that
	// commits its own work splits the history bosun is keeping and there is then
	// no single sha to record against the slice. The push follows every commit:
	// a provider's foundation on the remote is what a dependent stacks on.
	const finishWriting = async (msg: ExecStart, run: Run): Promise<void> => {
		const gate = run.repository
			? await configGate({ exec: opts.services.exec, worktreePath: msg.worktreePath, actor: 'bullet' })
			: null;

		if (gate !== null) {
			opts.send({ type: 'exec.error', runId: msg.runId, message: gate });

			return;
		}

		const committed = await opts.services.commit.commitAll({
			worktreePath: msg.worktreePath,
			keepOut: run.envFiles,
			message: commitMessageFor({
				planTitle: msg.planTitle,
				sliceOrdinal: msg.slice.ordinal,
				sliceTitle: msg.phase === 'fix' ? `${msg.slice.title} (fixes)` : msg.slice.title
			})
		});

		if (!committed.ok) {
			opts.send({
				type: 'exec.error',
				runId: msg.runId,
				message: `the bullet finished but could not be committed: ${committed.detail}`
			});

			return;
		}

		const pushed = msg.push
			? await opts.services.commit.pushBranch({ worktreePath: msg.worktreePath, branch: msg.branch })
			: null;

		if (pushed !== null && !pushed.ok) {
			console.error(`[${msg.runId}] ${pushed.detail}`);
		}

		opts.send({
			type: 'exec.done',
			runId: msg.runId,
			commitSha: committed.commitSha,
			report: run.report.slice(-REPORT_KEPT_CHARS),
			changedFiles:
				committed.commitSha === null
					? []
					: await opts.services.commit.changedFiles({ worktreePath: msg.worktreePath, sha: committed.commitSha }),
			pushed: pushed?.ok ?? false,
			pushError: pushed === null || pushed.ok ? null : pushed.detail
		});
	};

	const finish = async (msg: ExecStart): Promise<void> => {
		const run = runs.get(msg.runId);

		if (!run || run.settled) {
			return;
		}

		run.settled = true;
		await opts.services.stack.down(msg.runId);

		try {
			await (modeOf(msg) === 'lane' ? finishLane(msg, run) : finishWriting(msg, run));
		} finally {
			teardown(msg.runId);
		}
	};

	// Named, synced with its own remote, and — for a stacked plan — merged with
	// whatever its providers gained since it started. A conflict there is not
	// something a session should be handed half-merged.
	const prepareBranch = async (msg: ExecStart): Promise<void> => {
		const cleaned = await opts.services.commit.cleanTree({
			worktreePath: msg.worktreePath,
			branch: msg.branch
		});

		if (!cleaned.ok) {
			throw new Error(`could not clean the worktree: ${cleaned.detail}`);
		}

		if (msg.mergeIn.length === 0) {
			return;
		}

		const merged = await mergeBranches({ exec: opts.services.exec, worktreePath: msg.worktreePath, branches: msg.mergeIn });

		if (!merged.ok) {
			throw new Error(merged.detail);
		}
	};

	// Resolved from the tree the session runs in, after its branch is checked out: a
	// plan that changes how the app starts carries its own config, and that branch's
	// own verify pass starts the app the new way. A file that does not validate stops
	// the session here — it never falls back to the draft.
	//
	// Setup runs again before the session when a watched file changed since it last
	// ran, so a plan that added a dependency is not built on the node_modules the
	// worktree was created with.
	const prepareProject = async (msg: ExecStart): Promise<Project> => {
		const key = path.basename(msg.worktreePath);
		const activity = (label: string) => opts.send({ type: 'exec.activity', runId: msg.runId, label });

		if (opts.services.workspace.repositoryId() === null) {
			if (msg.profile.setupCommand !== null) {
				const legacy = await opts.services.setupSteps.runLegacy({
					key,
					worktreePath: msg.worktreePath,
					command: msg.profile.setupCommand,
					env: opts.services.claudeAuth.sessionEnv(),
					onlyChanged: true
				});

				if (!legacy.ok) {
					throw new Error(legacy.message);
				}
			}

			return { config: null, env: undefined, repository: false };
		}

		const resolved = resolveProjectConfig({ treePath: msg.worktreePath, draft: msg.configDraft });

		if (resolved.source === 'invalid') {
			throw new Error(resolved.detail);
		}

		const config = resolved.source === 'none' ? null : resolved.config;
		const environment = await prepareRunEnvironment({ services: opts.services, config, includeSecrets: true });

		if (!environment.ok) {
			throw new Error(environment.detail);
		}

		if (config !== null) {
			const rerun = await opts.services.setupSteps.rerunChanged({
				key,
				worktreePath: msg.worktreePath,
				config,
				env: environment.env,
				onStep: (name) => activity(`Re-running setup: ${name}`)
			});

			if (!rerun.ok) {
				throw new Error(rerun.message);
			}
		}

		return { config, env: environment.env, repository: true };
	};

	// The lane owns the machine's development database: it is reset before every
	// drive and migrated to this branch's schema, so a verdict is never reached
	// against another plan's unmerged schema. Both steps are policy-gated — a
	// machine pointed at a database bosun must not migrate is not one to reset.
	const prepareDatabase = async (msg: ExecStart, project: Project): Promise<void> => {
		const config = project.config;

		if (config === null || !(msg.policy?.applyMigrations ?? false)) {
			return;
		}

		const reset = config.verify?.resetDatabase;
		const steps = [
			...(reset === undefined ? [] : [{ label: 'Reset the database', cwd: reset.cwd, run: reset.run }]),
			...Object.entries(config.apps).flatMap(([app, definition]) =>
				definition.migrate === undefined ? [] : [{ label: `Migrate ${app}`, cwd: definition.cwd, run: definition.migrate }]
			)
		];

		for (const step of steps) {
			opts.send({ type: 'exec.activity', runId: msg.runId, label: step.label });

			const result = await runShell({
				command: step.run,
				cwd: path.join(msg.worktreePath, step.cwd ?? '.'),
				env: project.env ?? opts.services.claudeAuth.sessionEnv()
			});

			if (!result.ok) {
				throw new Error(`${step.label} failed (${result.detail})${result.tail.trim() === '' ? '' : `:\n${result.tail.trim().slice(-TAIL_KEPT_CHARS)}`}`);
			}
		}
	};

	const stackFor = (opts2: {
		msg: ExecStart;
		project: Project;
		scope: SessionScope | null;
	}): SessionStack | null => {
		const { msg, project } = opts2;
		const config = project.config;

		if (config === null || Object.keys(config.apps).length === 0 || modeOf(msg) === 'fix') {
			return null;
		}

		return {
			up: async (apps) =>
				opts.services.stack.up({
					key: msg.runId,
					config,
					worktreePath: msg.worktreePath,
					portBase: msg.portBase,
					env: project.env ?? opts.services.claudeAuth.sessionEnv(),
					apps,
					memoryMaxBytes: opts2.scope?.memoryMaxBytes ?? msg.memoryMaxBytes ?? null
				}),
			down: async () => opts.services.stack.down(msg.runId)
		};
	};

	const startProcess = async (msg: ExecStart, run: Run): Promise<void> => {
		await prepareBranch(msg);

		// Cancelled while the worktree was being prepared. Carrying on would start a
		// session the backend has already taken back.
		if (run.cancelled) {
			return;
		}

		const written = writeEnvFiles({ projectEnv: opts.services.projectEnv, worktreePath: msg.worktreePath, id: msg.runId });

		run.envFiles = written.written;

		const providedEnv = written.providedEnv;
		const project = await prepareProject(msg);

		run.repository = project.repository;

		if (modeOf(msg) === 'lane') {
			await prepareDatabase(msg, project);
		}

		if (run.cancelled) {
			return;
		}

		const userMcp = opts.services.mcpConfig.read();

		if (userMcp.error) {
			console.error(`custom mcp config ignored: ${userMcp.error}`);
		}

		const scope = opts.services.memory.sessionScope({
			runId: msg.runId,
			memoryMaxBytes: msg.memoryMaxBytes ?? null
		});
		const stack = stackFor({ msg, project, scope });
		const toolSet = { phase: phaseOf(msg), afk: msg.afk, stack: stack !== null };
		const mcp = await startSessionMcpServer({
			sessionId: msg.runId,
			definitions: executionDefinitions(toolSet),
			createDispatch: createExecutionDispatch({
				toolSet,
				planId: msg.planId,
				sliceId: msg.sliceId,
				buildId: msg.buildId,
				runId: msg.runId,
				bosunApi: opts.services.bosunApi,
				stack,
				onQuestion: ({ questionId, questions }) => {
					opts.send({ type: 'exec.question', runId: msg.runId, questionId, questions });
				}
			}),
			// A fix session drives no browser, and a user server is a credential it has
			// no use for.
			userServers: modeOf(msg) === 'fix' ? {} : userMcp.servers
		});

		if (run.cancelled) {
			await mcp.close();

			return;
		}

		run.mcp = mcp;
		opts.send({ type: 'exec.activity', runId: msg.runId, label: 'Starting the session' });

		const activity = createActivityTracker();
		const stderr = createStderrTail(STDERR_KEPT_CHARS);
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
			onDropped: logDroppedFrame
		});

		run.process = spawnClaudeSession({
			cwd: msg.worktreePath,
			prompt: promptFor({
				msg,
				providedEnv,
				project,
				sessionSecrets: project.repository ? opts.services.projectEnv.secretNames() : []
			}),
			mcpConfigPath: mcp.configPath,
			userServerNames: modeOf(msg) === 'fix' ? [] : userMcp.serverNames,
			tools: {
				builtin: modeOf(msg) === 'lane' ? LANE_BUILTIN_TOOLS : EXECUTION_BUILTIN_TOOLS,
				mcp: executionMcpTools(toolSet)
			},
			claudeAuth: opts.services.claudeAuth,
			env: project.env,
			scope,
			// Logged as well as shown: the browser's activity line is gone the moment
			// the next tool call replaces it, and the journal is where somebody
			// looks for why a machine keeps running out.
			onOomKill: (count) => {
				const limit = scope === null ? 'its' : `its ${formatGib(scope.memoryMaxBytes)}`;

				console.error(
					`[${msg.runId}] out of memory: the kernel killed a process at ${limit} limit (${count} so far)`
				);
				opts.send({
					type: 'exec.activity',
					runId: msg.runId,
					label: 'A command ran out of memory'
				});
			},
			onStdout: (chunk) => {
				parser.push(chunk);
			},
			onStderr: (chunk) => {
				stderr.push(chunk);
				console.error(`[${msg.runId}] ${chunk.trimEnd()}`);
			},
			onExit: (code, exit) => {
				parser.flush();

				if (run.cancelled) {
					return;
				}

				fail(
					msg.runId,
					exitMessage({ code, exit, stderr: stderr.value(), limitBytes: scope?.memoryMaxBytes ?? null })
				);
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
			// reads a session it dispatched seconds ago as one that died with the old
			// socket and puts it back — while the session it was told nothing about
			// goes on to start and build.
			const run: Run = {
				mcp: null,
				process: null,
				cancelled: false,
				settled: false,
				report: '',
				envFiles: [],
				repository: false
			};

			runs.set(msg.runId, run);

			await reportStartFailure({
				attempt: () => startProcess(msg, run),
				teardown: () => {
					teardown(msg.runId);
				},
				send: (message) => {
					opts.send({ type: 'exec.error', runId: msg.runId, message });
				}
			});
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
		// backend can tell a session that survived a reconnect from one that died
		// with the connection before it and has to be put back.
		held(): string[] {
			return [...runs.keys()];
		}
	};
}
