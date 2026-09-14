import path from 'path';
import { createActivityTracker } from '../planning/activity-labels';
import { createStreamParser } from '../planning/stream-parser';
import { executionPrompt } from '../prompts/execution';
import { verifyPrompt } from '../prompts/verify';
import { PROJECT_CONFIG_PATH, type ProjectConfig } from '../project-config';
import { type AgentMsg, type ExecStart, type PlanAnswer } from '../protocol';
import { resolveProjectConfig } from '../services/config-resolution';
import { type Services } from '../services/index';
import { formatGib, type SessionScope } from '../services/memory.service';
import { describeApplied, envFileFor } from '../services/project-env.service';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession, type SessionExit } from '../sessions/process';
import { commitMessageFor } from './commit';
import {
	createExecutionDispatch,
	executionDefinitions,
	executionMcpTools,
	type SessionStack
} from './mcp/tools';
import { prepareRunEnvironment } from './run-environment';

const STDERR_KEPT_CHARS = 500;
const REPORT_KEPT_CHARS = 4_000;

// Execution writes. Planning's set is deliberately not reused here: the whole
// difference between the two halves of the product is that one may change the
// repository and the other may not.
const EXECUTION_BUILTIN_TOOLS = ['Read', 'Grep', 'Glob', 'Task', 'Skill', 'Edit', 'Write', 'Bash'];

// A verify bullet orchestrates: its own sub-agents do the reading and the fixing,
// and it drives a browser through whatever MCP servers the machine has.
const VERIFY_BUILTIN_TOOLS = [...EXECUTION_BUILTIN_TOOLS, 'ToolSearch'];

interface Project {
	// Null on a machine with no repository, and on a repository that has no config
	// yet: both run on the profile, as every machine did before configs existed.
	config: ProjectConfig | null;
	// Null lets the session inherit the credential environment unchanged.
	env: NodeJS.ProcessEnv | undefined;
	repository: boolean;
}

function promptFor(opts: {
	msg: ExecStart;
	providedEnv: { path: string; keys: string[] }[];
	project: Project;
	sessionSecrets: string[];
}): string {
	const { msg } = opts;
	const shared = {
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
		planAcs: msg.planAcs,
		sliceOrdinal: msg.slice.ordinal,
		sliceTitle: msg.slice.title,
		sliceBodyMd: msg.slice.bodyMd,
		doneSlices: msg.doneSlices,
		providedEnv: opts.providedEnv
	};

	return msg.slice.kind === 'verify'
		? verifyPrompt(shared)
		: executionPrompt({ ...shared, sliceKind: msg.slice.kind, acs: msg.acs });
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
	// Null while the bullet is being set up. The run is in the map before either
	// exists, because `hello` reads this map to say what this agent still holds:
	// a run missing from it is one the backend puts back and pauses the queue over,
	// and the setup below can take a `git fetch` and a worktree reset to finish.
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

	// The stack goes with the session however the session ends. A bullet that dies
	// mid-browser-pass would otherwise leave its apps holding the queue's ports and
	// the memory the next bullet is admitted against.
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

	// A bullet that touched `.bosun/project.yaml` is refused rather than committed
	// when it left the file invalid: the next bullet on this branch would stop on
	// it anyway, somewhere far from the change that broke it.
	const configGate = async (worktreePath: string): Promise<string | null> => {
		const changed = await opts.services.exec.run('git', ['-C', worktreePath, 'status', '--porcelain', '--', PROJECT_CONFIG_PATH], {
			timeoutMs: 30_000
		});

		if (!changed.ok || changed.stdout === '') {
			return null;
		}

		const resolved = resolveProjectConfig({ treePath: worktreePath, draft: null });

		return resolved.source === 'invalid' ? `the bullet left ${resolved.detail}` : null;
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
		await opts.services.stack.down(msg.runId);

		const gate = run.repository ? await configGate(msg.worktreePath) : null;

		if (gate !== null) {
			opts.send({ type: 'exec.error', runId: msg.runId, message: gate });
			teardown(msg.runId);

			return;
		}

		const committed = await opts.services.commit.commitAll({
			worktreePath: msg.worktreePath,
			keepOut: run.envFiles,
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

	const prepareBranch = async (msg: ExecStart): Promise<void> => {
		if (msg.freshBranch) {
			const branched = await opts.services.commit.startBranch({
				worktreePath: msg.worktreePath,
				branch: msg.branch,
				baseRef: msg.baseRef
			});

			if (!branched.ok) {
				throw new Error(branched.detail);
			}

			return;
		}

		const cleaned = await opts.services.commit.cleanTree({
			worktreePath: msg.worktreePath,
			branch: msg.branch
		});

		if (!cleaned.ok) {
			throw new Error(`could not clean the worktree: ${cleaned.detail}`);
		}
	};

	// Resolved from the tree the bullet runs in, after its branch is checked out: a
	// plan that changes how the app starts carries its own config, and that branch's
	// own verify bullet starts the app the new way. A file that does not validate
	// stops the bullet here — it never falls back to the draft.
	//
	// Setup runs again before the bullet when a watched file changed since it last
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

	// After the branch step, whose `git clean -fd` takes an untracked `.env` with
	// it, and before anything reads the worktree. A bullet that starts without its
	// connection is a bullet that builds a database of its own in /tmp.
	const writeEnvFiles = (msg: ExecStart, run: Run): { path: string; keys: string[] }[] => {
		let applied: { written: string[]; skipped: string[] };

		try {
			applied = opts.services.projectEnv.applyTo(msg.worktreePath);
		} catch (error) {
			throw new Error(
				`could not write the provided env files: ${error instanceof Error ? error.message : 'unknown error'}`
			);
		}

		const envLine = describeApplied(applied);

		if (envLine !== null) {
			console.log(`[${msg.runId}] ${envLine}`);
		}

		run.envFiles = applied.written;

		// Only what was written. A set skipped for a directory this branch lacks,
		// named in the prompt, sends the session after a connection that is not there.
		return opts.services.projectEnv
			.summary()
			.filter((set) => applied.written.includes(envFileFor(set.path)))
			.map((set) => ({ path: set.path, keys: set.keys }));
	};

	const stackFor = (opts2: {
		msg: ExecStart;
		project: Project;
		scope: SessionScope | null;
	}): SessionStack | null => {
		const { msg, project } = opts2;
		const config = project.config;

		if (config === null || Object.keys(config.apps).length === 0) {
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
		// session for a bullet the backend has already taken back.
		if (run.cancelled) {
			return;
		}

		const providedEnv = writeEnvFiles(msg, run);
		const project = await prepareProject(msg);

		run.repository = project.repository;

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
		const toolSet = { afk: msg.afk, verify: msg.slice.kind === 'verify', stack: stack !== null };
		const mcp = await startSessionMcpServer({
			sessionId: msg.runId,
			definitions: executionDefinitions(toolSet),
			createDispatch: createExecutionDispatch({
				afk: msg.afk,
				planId: msg.planId,
				sliceId: msg.sliceId,
				bosunApi: opts.services.bosunApi,
				stack,
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
			prompt: promptFor({
				msg,
				providedEnv,
				project,
				sessionSecrets: project.repository ? opts.services.projectEnv.secretNames() : []
			}),
			mcpConfigPath: mcp.configPath,
			userServerNames: userMcp.serverNames,
			tools: {
				builtin: msg.slice.kind === 'verify' ? VERIFY_BUILTIN_TOOLS : EXECUTION_BUILTIN_TOOLS,
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
				stderr = `${stderr}${chunk}`.slice(-STDERR_KEPT_CHARS);
				console.error(`[${msg.runId}] ${chunk.trimEnd()}`);
			},
			onExit: (code, exit) => {
				parser.flush();

				if (run.cancelled) {
					return;
				}

				fail(
					msg.runId,
					exitMessage({ code, exit, stderr, limitBytes: scope?.memoryMaxBytes ?? null })
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
			// reads a bullet it dispatched seconds ago as one that died with the old
			// socket, puts it back, and pauses the queue — while the session it was
			// told nothing about goes on to start and build.
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
