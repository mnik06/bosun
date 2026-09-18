import fs from 'fs';
import os from 'os';
import path from 'path';
import { NO_PUSH_GIT_ENV, prepareRunEnvironment } from '../execution/run-environment';
import { createStreamParser } from '../planning/stream-parser';
import { PROJECT_CONFIG_PATH, type ProjectConfig } from '../project-config';
import { DISCOVERY_NUDGE, discoveryPrompt, signInPrompt } from '../prompts/onboarding';
import { type AgentMsg, type OnboardingStart } from '../protocol';
import { launchBrowser } from '../services/browser.service';
import { resolveProjectConfig } from '../services/config-resolution';
import { type Services } from '../services/index';
import { browserCachePath } from '../services/preflight.service';
import { describeApplied } from '../services/project-env.service';
import { NO_REPOSITORY } from '../services/repo.service';
import { runShell } from '../services/setup-steps.service';
import { appPorts, renderTemplate } from '../services/stack.service';
import { startSessionMcpServer, type SessionDispatchFactory, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { createStderrTail, logDroppedFrame, pipeSessionOutput } from '../sessions/turn-support';
import { clipTail } from '../utils';
import {
	createDiscoveryDispatch,
	createSignInDispatch,
	DISCOVERY_DEFINITIONS,
	DISCOVERY_MCP_TOOLS,
	SIGN_IN_DEFINITIONS,
	SIGN_IN_MCP_TOOLS
} from './mcp/tools';

const ONBOARDING_DIRNAME = 'onboarding';

const DETAIL_CHARS = 1_500;
const WORKTREE_TIMEOUT_MS = 120_000;

const DISCOVERY_TOOLS = ['Read', 'Grep', 'Glob', 'Task', 'Skill', 'Edit', 'Write', 'Bash', 'ToolSearch'];
const SIGN_IN_TOOLS = ['Bash', 'ToolSearch'];

type Outcome = { ok: true } | { ok: false; message: string };

interface Run {
	cancelled: boolean;
	repoPath: string | null;
	worktreePath: string | null;
	mcp: SessionMcpServer | null;
	process: ClaudeSession | null;
	// Progress lines are posted one after another, so the report reads in the order
	// the steps happened rather than the order their requests came back.
	reports: Promise<void>;
	// Verify's plan once its config is known: every step it will report as finished.
	// What makes its percentage exact rather than a guess.
	plan: { done: number; total: number } | null;
	// Discovery's, which is an estimate and only ever moves forward.
	estimate: number;
}

// Below the whole bar: a discovery is not done until it has settled, whatever the
// session thinks of its own progress.
const ESTIMATE_CEILING = 0.95;

// Every step verify will report as finished, counted from the config before any
// of them runs.
export function verifyPlanTotal(opts: { config: ProjectConfig; applyMigrations: boolean }): number {
	const apps = Object.values(opts.config.apps);
	const codegen = apps.filter((app) => app.codegen !== undefined).length;
	const migrate = apps.filter((app) => app.migrate !== undefined).length;

	return (
		3 +
		Math.max(1, opts.config.setup.length) +
		codegen +
		(opts.applyMigrations ? migrate : 1) +
		1 +
		(opts.config.testAccounts.length > 0 ? 1 + opts.config.testAccounts.length : 1)
	);
}

export interface OnboardingSessions {
	start(msg: OnboardingStart): Promise<void>;
	cancel(runId: string): void;
	cancelAll(): void;
	held(): string[];
	running(): number;
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export function createOnboardingSessions(opts: { services: Services; send: (message: AgentMsg) => void }): OnboardingSessions {
	const { services } = opts;
	const runs = new Map<string, Run>();
	const root = path.join(os.homedir(), '.bosun', ONBOARDING_DIRNAME);

	const git = async (args: string[], timeoutMs = 60_000) => services.exec.run('git', args, { timeoutMs });

	function advance(run: Run, estimate: number | undefined): number | null {
		if (estimate === undefined) {
			return null;
		}

		run.estimate = Math.max(run.estimate, Math.min(estimate, ESTIMATE_CEILING));

		return run.estimate;
	}

	// A finished step of verify's plan moves its count; anything else carries the
	// progress as it stands. Discovery's lines carry whatever estimate they were given.
	function progressFor(opts2: { run: Run; status: 'info' | 'running' | 'passed' | 'failed'; estimate?: number }): number | null {
		const { plan } = opts2.run;

		if (plan === null) {
			return advance(opts2.run, opts2.estimate);
		}

		if (opts2.status === 'passed' || opts2.status === 'info') {
			plan.done += 1;
		}

		return Math.min(1, plan.done / plan.total);
	}

	function report(opts2: { runId: string; run: Run; label: string; status: 'info' | 'running' | 'passed' | 'failed'; detail?: string | null; estimate?: number }): void {
		const detail = opts2.detail === undefined || opts2.detail === null || opts2.detail.trim() === '' ? null : clipTail(opts2.detail, DETAIL_CHARS);
		const progress = progressFor(opts2);

		opts2.run.reports = opts2.run.reports
			.then(async () => {
				await services.bosunApi.reportOnboardingStep({ runId: opts2.runId, label: opts2.label, status: opts2.status, detail, progress });
			})
			.catch((error: unknown) => {
				console.error(`[${opts2.runId}] could not report "${opts2.label}": ${errorMessage(error, 'unknown error')}`);
			});
	}

	// A detached checkout of the default branch that nothing else writes to. The
	// machine's clone gains only worktree metadata; every file a run writes lands
	// here, and the directory goes when the run settles.
	async function createScratch(msg: OnboardingStart, run: Run): Promise<string> {
		const repoPath = services.workspace.repoPath();

		if (repoPath === null) {
			throw new Error(NO_REPOSITORY);
		}

		await services.repo.fetch();

		const ref = msg.baseBranch === undefined ? await services.repo.baseRef() : `origin/${msg.baseBranch}`;

		if (ref === null) {
			throw new Error(`${repoPath} has no default branch to onboard from`);
		}

		const target = path.join(root, msg.runId);

		fs.mkdirSync(root, { recursive: true, mode: 0o700 });
		fs.rmSync(target, { recursive: true, force: true });
		await git(['-C', repoPath, 'worktree', 'prune']);

		const created = await git(['-C', repoPath, 'worktree', 'add', '--detach', target, ref], WORKTREE_TIMEOUT_MS);

		if (!created.ok) {
			throw new Error(`could not create a scratch checkout of ${ref}: ${created.reason}`);
		}

		run.repoPath = repoPath;
		run.worktreePath = target;

		return target;
	}

	async function removeScratch(run: Run): Promise<void> {
		const { repoPath, worktreePath } = run;

		run.worktreePath = null;

		if (worktreePath === null) {
			return;
		}

		if (repoPath !== null) {
			await git(['-C', repoPath, 'worktree', 'remove', '--force', worktreePath]);
		}

		fs.rmSync(worktreePath, { recursive: true, force: true });

		if (repoPath !== null) {
			await git(['-C', repoPath, 'worktree', 'prune']);
		}
	}

	// Idempotent: a cancel and the run's own ending both arrive here, in either order.
	async function release(runId: string, run: Run): Promise<void> {
		const { process, mcp } = run;

		run.process = null;
		run.mcp = null;
		process?.kill();
		await mcp?.close();
		await services.stack.down(runId);
		await removeScratch(run);
	}

	// One claude turn to its result. `onTurnEnd` decides whether a finished turn
	// is the end of the session or the moment to send it another prompt.
	async function converse(opts2: {
		runId: string;
		run: Run;
		cwd: string;
		prompt: string;
		builtin: string[];
		mcpTools: string[];
		definitions: unknown[];
		createDispatch: SessionDispatchFactory;
		env: NodeJS.ProcessEnv;
		memoryMaxBytes: number | null;
		onTurnEnd: (send: (text: string) => void) => Outcome | null;
	}): Promise<Outcome> {
		const userMcp = services.mcpConfig.read();

		if (userMcp.error) {
			console.error(`custom mcp config ignored: ${userMcp.error}`);
		}

		const mcp = await startSessionMcpServer({
			sessionId: opts2.runId,
			definitions: opts2.definitions,
			createDispatch: opts2.createDispatch,
			userServers: userMcp.servers
		});

		if (opts2.run.cancelled) {
			await mcp.close();

			return { ok: false, message: 'cancelled' };
		}

		opts2.run.mcp = mcp;

		return new Promise<Outcome>((resolve) => {
			let settled = false;
			const stderr = createStderrTail();
			const settle = (outcome: Outcome) => {
				if (!settled) {
					settled = true;
					resolve(outcome);
				}
			};
			const parser = createStreamParser({
				onEvent: (event) => {
					if (event.kind !== 'result') {
						return;
					}

					if (!event.ok) {
						settle({ ok: false, message: event.message });

						return;
					}

					const outcome = opts2.onTurnEnd((text) => opts2.run.process?.send(text));

					if (outcome !== null) {
						settle(outcome);
					}
				},
				onDropped: logDroppedFrame
			});

			const pipe = pipeSessionOutput({ parser, stderr, tag: opts2.runId });

			opts2.run.process = spawnClaudeSession({
				cwd: opts2.cwd,
				prompt: opts2.prompt,
				mcpConfigPath: mcp.configPath,
				userServerNames: userMcp.serverNames,
				tools: { builtin: opts2.builtin, mcp: opts2.mcpTools },
				claudeAuth: services.claudeAuth,
				env: opts2.env,
				scope: services.memory.sessionScope({ runId: opts2.runId, memoryMaxBytes: opts2.memoryMaxBytes }),
				onStdout: pipe.onStdout,
				onStderr: pipe.onStderr,
				onExit: (code) => {
					pipe.onExit();
					settle({ ok: false, message: stderr.value().trim() || `claude exited with code ${code ?? 'unknown'}` });
				}
			});
		});
	}

	async function discover(msg: OnboardingStart, run: Run, scratch: string): Promise<Outcome> {
		const file = path.join(scratch, PROJECT_CONFIG_PATH);
		const existingConfig = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
		let published = false;
		let nudged = false;

		report({ runId: msg.runId, run, label: 'Reading the repository', status: 'running', detail: null, estimate: 0.05 });

		return converse({
			runId: msg.runId,
			run,
			cwd: scratch,
			prompt: discoveryPrompt({ portBase: msg.portBase, existingConfig, configPath: PROJECT_CONFIG_PATH }),
			builtin: DISCOVERY_TOOLS,
			mcpTools: DISCOVERY_MCP_TOOLS,
			definitions: DISCOVERY_DEFINITIONS,
			createDispatch: createDiscoveryDispatch({
				runId: msg.runId,
				bosunApi: services.bosunApi,
				scratch: {
					exists: async (branch) => (await git(['-C', scratch, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])).ok,
					// Forced: the installs discovery ran may have touched tracked files, and
					// nothing in a scratch checkout is anyone's work.
					checkout: async (branch) => {
						const switched = await git(['-C', scratch, 'checkout', '--force', '--detach', `origin/${branch}`]);

						return switched.ok ? null : switched.reason;
					}
				},
				onPublished: () => {
					if (!published) {
						report({ runId: msg.runId, run, label: 'Config accepted by bosun', status: 'passed', detail: null, estimate: 0.85 });
					}

					published = true;
				},
				advance: (estimate) => advance(run, estimate)
			}),
			env: NO_PUSH_GIT_ENV,
			memoryMaxBytes: msg.memoryMaxBytes,
			onTurnEnd: (send) => {
				if (published) {
					return { ok: true };
				}

				if (!nudged) {
					nudged = true;
					send(DISCOVERY_NUDGE);

					return null;
				}

				return { ok: false, message: 'the discovery session ended without publishing a config that validated' };
			}
		});
	}

	async function signIn(opts2: {
		msg: OnboardingStart;
		run: Run;
		scratch: string;
		config: ProjectConfig;
		env: NodeJS.ProcessEnv;
	}): Promise<Outcome> {
		const ports = appPorts(opts2.config, opts2.msg.portBase);
		const accounts = opts2.config.testAccounts.map((account) => ({
			role: account.role,
			url: renderTemplate(account.signIn, { app: null, ports }),
			secrets: account.secrets
		}));
		const reported = new Map<string, { ok: boolean; detail: string }>();
		const turn = await converse({
			runId: opts2.msg.runId,
			run: opts2.run,
			cwd: opts2.scratch,
			prompt: signInPrompt({ accounts }),
			builtin: SIGN_IN_TOOLS,
			mcpTools: SIGN_IN_MCP_TOOLS,
			definitions: SIGN_IN_DEFINITIONS,
			createDispatch: createSignInDispatch({
				onReport: (entry) => {
					reported.set(entry.role, { ok: entry.ok, detail: entry.detail });
				}
			}),
			env: { ...opts2.env, ...NO_PUSH_GIT_ENV },
			memoryMaxBytes: opts2.msg.memoryMaxBytes,
			onTurnEnd: () => ({ ok: true })
		});
		const { process, mcp } = opts2.run;

		opts2.run.process = null;
		opts2.run.mcp = null;
		process?.kill();
		await mcp?.close();

		const failed: string[] = [];

		for (const account of accounts) {
			const entry = reported.get(account.role);
			const ok = entry?.ok === true;

			report({
				runId: opts2.msg.runId,
				run: opts2.run,
				label: `Sign in as ${account.role}`,
				status: ok ? 'passed' : 'failed',
				detail: entry?.detail ?? (turn.ok ? 'the session did not report this account' : turn.message)
			});

			if (!ok) {
				failed.push(`${account.role}: ${entry?.detail ?? (turn.ok ? 'not reported' : turn.message)}`);
			}
		}

		return failed.length === 0 ? { ok: true } : { ok: false, message: `Sign in: ${failed.join('; ')}` };
	}

	// Each command the config names, one after another, with a line before and a
	// line after. Only the sign-in needs a model; everything else is run here, so
	// "ready" means the steps ran rather than that a session believed they would.
	async function runCommands(opts2: {
		msg: OnboardingStart;
		run: Run;
		scratch: string;
		config: ProjectConfig;
		env: NodeJS.ProcessEnv;
		field: 'codegen' | 'migrate';
		label: string;
	}): Promise<Outcome> {
		for (const [app, definition] of Object.entries(opts2.config.apps)) {
			const command = definition[opts2.field];

			if (command === undefined || opts2.run.cancelled) {
				continue;
			}

			const label = `${opts2.label}: ${app}`;

			report({ runId: opts2.msg.runId, run: opts2.run, label, status: 'running', detail: command });

			const result = await runShell({ command, cwd: path.join(opts2.scratch, definition.cwd ?? '.'), env: opts2.env });

			report({ runId: opts2.msg.runId, run: opts2.run, label, status: result.ok ? 'passed' : 'failed', detail: result.ok ? null : `${result.detail}\n${result.tail}` });

			if (!result.ok) {
				return { ok: false, message: `${label}: ${clipTail(`${result.detail}\n${result.tail}`, DETAIL_CHARS)}` };
			}
		}

		return { ok: true };
	}

	async function prepare(msg: OnboardingStart, run: Run, scratch: string): Promise<{ ok: true; config: ProjectConfig; env: NodeJS.ProcessEnv } | { ok: false; message: string }> {
		const step = (label: string, status: 'passed' | 'failed' | 'info', detail: string | null) => {
			report({ runId: msg.runId, run, label, status, detail });
		};
		const resolved = resolveProjectConfig({ treePath: scratch, draft: msg.configDraft, preferDraft: msg.preferDraft });

		if (resolved.source === 'none' || resolved.source === 'invalid') {
			const detail = resolved.source === 'none'
				? `the default branch has no ${PROJECT_CONFIG_PATH} and bosun holds no draft`
				: resolved.detail;

			step('Resolve the config', 'failed', detail);

			return { ok: false, message: `Resolve the config: ${detail}` };
		}

		run.plan = { done: 0, total: verifyPlanTotal({ config: resolved.config, applyMigrations: msg.applyMigrations }) };
		step('Resolve the config', 'passed', resolved.source === 'file' ? `from ${PROJECT_CONFIG_PATH} on the default branch` : 'from the draft in bosun');

		try {
			step('Write the provided env files', 'passed', describeApplied(services.projectEnv.applyTo(scratch)) ?? 'nothing to write');
		} catch (error) {
			const detail = errorMessage(error, 'could not write the provided env files');

			step('Write the provided env files', 'failed', detail);

			return { ok: false, message: `Write the provided env files: ${detail}` };
		}

		report({ runId: msg.runId, run, label: 'Provision the toolchain', status: 'running', detail: null });

		const environment = await prepareRunEnvironment({ services, config: resolved.config, includeSecrets: true });

		if (!environment.ok) {
			step('Provision the toolchain', 'failed', environment.detail);

			return { ok: false, message: `Provision the toolchain: ${environment.detail}` };
		}

		const toolchain = resolved.config.toolchain;

		step('Provision the toolchain', 'passed', toolchain === undefined
			? 'the config names none — the machine\'s own tools'
			: [`node ${toolchain.node}`, toolchain.packageManager].filter(Boolean).join(', '));

		return { ok: true, config: resolved.config, env: environment.env };
	}

	async function setup(msg: OnboardingStart, run: Run, scratch: string, prepared: { config: ProjectConfig; env: NodeJS.ProcessEnv }): Promise<Outcome> {
		if (prepared.config.setup.length === 0) {
			report({ runId: msg.runId, run, label: 'Setup', status: 'info', detail: 'the config has no setup steps' });

			return { ok: true };
		}

		const result = await services.setupSteps.runAll({
			key: `onboarding-${msg.runId}`,
			worktreePath: scratch,
			config: prepared.config,
			env: prepared.env,
			onStep: (name) => {
				report({ runId: msg.runId, run, label: `Setup: ${name}`, status: 'running', detail: null });
			}
		});

		services.setupSteps.forget(`onboarding-${msg.runId}`);

		if (!result.ok) {
			report({ runId: msg.runId, run, label: `Setup: ${result.step}`, status: 'failed', detail: result.message });

			return { ok: false, message: `Setup: ${clipTail(result.message, DETAIL_CHARS)}` };
		}

		for (const name of result.ran) {
			report({ runId: msg.runId, run, label: `Setup: ${name}`, status: 'passed', detail: null });
		}

		return { ok: true };
	}

	async function startStack(msg: OnboardingStart, run: Run, scratch: string, prepared: { config: ProjectConfig; env: NodeJS.ProcessEnv }): Promise<Outcome> {
		if (Object.keys(prepared.config.apps).length === 0) {
			report({ runId: msg.runId, run, label: 'Start the apps', status: 'info', detail: 'the config has no apps' });

			return { ok: true };
		}

		report({ runId: msg.runId, run, label: 'Start the apps', status: 'running', detail: null });

		const stack = await services.stack.up({
			key: msg.runId,
			config: prepared.config,
			worktreePath: scratch,
			portBase: msg.portBase,
			env: prepared.env,
			memoryMaxBytes: msg.memoryMaxBytes
		});

		if (!stack.ok) {
			const detail = `${stack.app}: ${stack.reason}${stack.logTail === '' ? '' : `\n${stack.logTail}`}`;

			report({ runId: msg.runId, run, label: 'Start the apps', status: 'failed', detail });

			return { ok: false, message: `Start the apps: ${clipTail(detail, DETAIL_CHARS)}` };
		}

		report({ runId: msg.runId, run, label: 'Start the apps', status: 'passed', detail: stack.apps.map((app) => `${app.app} ${app.url}`).join(', ') });

		return { ok: true };
	}

	// The sign-in session drives a browser, and the browser tool's own refusal only
	// reaches the report as the session's paraphrase. Checked here, the report names
	// what is missing and the root command that installs it, and no session starts.
	async function checkBrowser(msg: OnboardingStart, run: Run): Promise<Outcome> {
		const label = 'Browser can start';

		if (!services.mcpConfig.read().serverNames.includes('playwright')) {
			report({ runId: msg.runId, run, label, status: 'info', detail: 'playwright is switched off on this machine' });

			return { ok: true };
		}

		const launched = await launchBrowser({
			exec: services.exec,
			cachePath: browserCachePath({ platform: process.platform, home: os.homedir(), configured: process.env.PLAYWRIGHT_BROWSERS_PATH })
		});

		report({ runId: msg.runId, run, label, status: launched.ok ? 'passed' : 'failed', detail: launched.detail });

		return launched.ok ? { ok: true } : { ok: false, message: `${label}: ${launched.detail}` };
	}

	async function verify(msg: OnboardingStart, run: Run, scratch: string): Promise<Outcome> {
		const prepared = await prepare(msg, run, scratch);

		if (!prepared.ok) {
			return prepared;
		}

		try {
			const stages: (() => Promise<Outcome>)[] = [
				async () => setup(msg, run, scratch, prepared),
				async () => runCommands({ msg, run, scratch, ...prepared, field: 'codegen', label: 'Codegen' }),
				async () => {
					if (msg.applyMigrations) {
						return runCommands({ msg, run, scratch, ...prepared, field: 'migrate', label: 'Migrate' });
					}

					report({ runId: msg.runId, run, label: 'Migrate', status: 'info', detail: 'skipped — this machine does not apply migrations' });

					return { ok: true };
				},
				async () => startStack(msg, run, scratch, prepared),
				async () => {
					if (prepared.config.testAccounts.length > 0) {
						const browser = await checkBrowser(msg, run);

						return browser.ok ? signIn({ msg, run, scratch, config: prepared.config, env: prepared.env }) : browser;
					}

					report({ runId: msg.runId, run, label: 'Sign in', status: 'info', detail: 'the config names no test accounts' });

					return { ok: true };
				}
			];

			for (const stage of stages) {
				if (run.cancelled) {
					return { ok: false, message: 'cancelled' };
				}

				const outcome = await stage();

				if (!outcome.ok) {
					return outcome;
				}
			}

			return { ok: true };
		} finally {
			await services.stack.down(msg.runId);
		}
	}

	function cancel(runId: string): void {
		const run = runs.get(runId);

		if (!run) {
			return;
		}

		run.cancelled = true;
		runs.delete(runId);
		void release(runId, run);
	}

	return {
		async start(msg): Promise<void> {
			if (runs.has(msg.runId)) {
				return;
			}

			// In the map before the first await, so a `hello` sent while the scratch
			// checkout is still being made names this run as held.
			const run: Run = {
				cancelled: false,
				repoPath: null,
				worktreePath: null,
				mcp: null,
				process: null,
				reports: Promise.resolve(),
				plan: null,
				estimate: 0
			};

			runs.set(msg.runId, run);

			let outcome: Outcome;

			try {
				const scratch = await createScratch(msg, run);

				outcome = msg.phase === 'discover' ? await discover(msg, run, scratch) : await verify(msg, run, scratch);
			} catch (error) {
				outcome = { ok: false, message: errorMessage(error, 'the onboarding run failed') };
			}

			await run.reports;
			await release(msg.runId, run);

			if (run.cancelled) {
				return;
			}

			// Out of the map before the frame goes: a discovery's `done` is answered with
			// a verify for the same run id, and a run still held here would drop it.
			runs.delete(msg.runId);
			opts.send(outcome.ok ? { type: 'onboarding.done', runId: msg.runId } : { type: 'onboarding.error', runId: msg.runId, message: clipTail(outcome.message, DETAIL_CHARS) });
		},

		cancel,

		cancelAll(): void {
			for (const runId of [...runs.keys()]) {
				cancel(runId);
			}
		},

		held(): string[] {
			return [...runs.keys()];
		},

		running(): number {
			return runs.size;
		}
	};
}
