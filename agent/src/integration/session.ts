import path from 'path';
import { syncWithRemote } from '../execution/commit';
import { NO_PUSH_GIT_ENV, prepareRunEnvironment } from '../execution/run-environment';
import { createActivityTracker } from '../planning/activity-labels';
import { createStreamParser } from '../planning/stream-parser';
import { conflictPrompt, repairPrompt } from '../prompts/conflict';
import { type ProjectConfig } from '../project-config';
import {
	type AgentMsg,
	type IntegrateStart,
	type PlanCriteria,
	type Regenerated,
	type ResolvedConflict
} from '../protocol';
import { resolveProjectConfig } from '../services/config-resolution';
import { type Services } from '../services/index';
import { envFileFor } from '../services/project-env.service';
import { runShell } from '../services/setup-steps.service';
import { startSessionMcpServer, type SessionMcpServer } from '../sessions/mcp-server';
import { spawnClaudeSession, type ClaudeSession } from '../sessions/process';
import { getIntegrationGit, type IntegrationGit } from './git';
import { CONFLICT_DEFINITIONS, CONFLICT_MCP_TOOLS, createConflictDispatch } from './mcp/tools';

const OUTPUT_KEPT_CHARS = 3_000;
const DETAIL_KEPT_CHARS = 2_000;
const STDERR_KEPT_CHARS = 500;
const SESSION_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'];

type Done = Extract<AgentMsg, { type: 'integrate.done' }>;

type Outcome =
	| { kind: 'done'; frame: Omit<Done, 'type' | 'integrationId'> }
	| { kind: 'needs_you'; reason: 'conflict' | 'checks' | 'error'; detail: string };

interface Entry {
	cancelled: boolean;
	process: ClaudeSession | null;
	mcp: SessionMcpServer | null;
	// Where the integration started. Anything that does not finish returns here.
	preHead: string | null;
}

export interface IntegrationSessions {
	start(msg: IntegrateStart): Promise<void>;
	cancel(integrationId: string): void;
	cancelAll(): void;
	held(): string[];
	running(): number;
}

function clip(text: string, max: number): string {
	const trimmed = text.trim();

	return trimmed.length <= max ? trimmed : `…${trimmed.slice(-max)}`;
}

function needsYou(reason: 'conflict' | 'checks' | 'error', detail: string): Outcome {
	return { kind: 'needs_you', reason, detail: clip(detail, DETAIL_KEPT_CHARS) };
}

class Cancelled extends Error {}

// A finished branch is merged with what it lands on, its generated files are
// produced again instead of merged, a real conflict goes to a session given every
// plan's criteria, and nothing is pushed while the project's checks are red. See
// `README.md` beside this file for why each step is shaped the way it is.
export function createIntegrationSessions(opts: { services: Services; send: (message: AgentMsg) => void }): IntegrationSessions {
	const { services } = opts;
	const entries = new Map<string, Entry>();

	function release(entry: Entry): void {
		const { process, mcp } = entry;

		entry.process = null;
		entry.mcp = null;
		process?.kill();
		void mcp?.close();
	}

	// One claude turn to its result, in the mid-merge worktree. It cannot push:
	// the credential helper is cleared for it, and bosun pushes only once the
	// checks are green.
	async function converse(ctx: {
		msg: IntegrateStart;
		entry: Entry;
		prompt: string;
		env: NodeJS.ProcessEnv;
		onGiveUp: (reason: string) => void;
	}): Promise<{ ok: true } | { ok: false; message: string }> {
		const mcp = await startSessionMcpServer({
			sessionId: ctx.msg.integrationId,
			definitions: CONFLICT_DEFINITIONS,
			createDispatch: createConflictDispatch({ onGiveUp: ctx.onGiveUp }),
			log: (line) => {
				console.log(line);
			}
		});

		ctx.entry.mcp = mcp;

		const activity = createActivityTracker();

		try {
			return await new Promise((resolve) => {
				let stderr = '';
				const parser = createStreamParser({
					onEvent: (event) => {
						if (event.kind === 'tool') {
							opts.send({
								type: 'integrate.activity',
								integrationId: ctx.msg.integrationId,
								label: activity.label({ tool: event.name, subagent: event.subagent })
							});
						}

						if (event.kind === 'result') {
							resolve(event.ok ? { ok: true } : { ok: false, message: event.message });
						}
					},
					onDropped: () => {}
				});

				ctx.entry.process = spawnClaudeSession({
					cwd: ctx.msg.worktreePath,
					prompt: ctx.prompt,
					mcpConfigPath: mcp.configPath,
					userServerNames: [],
					tools: { builtin: SESSION_TOOLS, mcp: CONFLICT_MCP_TOOLS },
					claudeAuth: services.claudeAuth,
					env: { ...ctx.env, ...NO_PUSH_GIT_ENV },
					scope: services.memory.sessionScope({ runId: ctx.msg.integrationId, memoryMaxBytes: ctx.msg.memoryMaxBytes }),
					onStdout: (chunk) => {
						parser.push(chunk);
					},
					onStderr: (chunk) => {
						stderr = `${stderr}${chunk}`.slice(-STDERR_KEPT_CHARS);
					},
					onExit: (code) => {
						parser.flush();
						resolve({ ok: false, message: stderr.trim() || `claude exited with code ${code ?? 'unknown'}` });
					}
				});
			});
		} finally {
			release(ctx.entry);
		}
	}

	async function runChecks(ctx: {
		msg: IntegrateStart;
		config: ProjectConfig | null;
		env: NodeJS.ProcessEnv;
	}): Promise<{ ok: true; ran: number } | { ok: false; check: string; output: string }> {
		const checks = ctx.config?.checks ?? [];

		for (const check of checks) {
			opts.send({ type: 'integrate.activity', integrationId: ctx.msg.integrationId, label: `Check: ${check.name ?? check.run}` });

			const result = await runShell({ command: check.run, cwd: path.join(ctx.msg.worktreePath, check.cwd ?? '.'), env: ctx.env });

			if (!result.ok) {
				return {
					ok: false,
					check: `${check.run}${check.cwd === undefined ? '' : ` (in ${check.cwd})`}`,
					output: clip(`${result.detail}\n${result.tail}`, OUTPUT_KEPT_CHARS)
				};
			}
		}

		return { ok: true, ran: checks.length };
	}

	// The criteria of every plan whose commits the conflict comes from. A lookup
	// that fails still leaves the session this plan's own criteria.
	async function othersFor(ctx: { git: IntegrationGit; msg: IntegrateStart; ontoRef: string; files: string[] }): Promise<PlanCriteria[]> {
		const numbers = (await ctx.git.planNumbersTouching({ ontoRef: ctx.ontoRef, files: ctx.files })).filter(
			(number) => number !== ctx.msg.criteria.planNumber
		);

		return services.bosunApi.planCriteria(numbers).catch((error: unknown) => {
			console.error(`[${ctx.msg.integrationId}] could not read the other plans' criteria: ${error instanceof Error ? error.message : 'unknown error'}`);

			return [];
		});
	}

	async function resolveConflicts(ctx: {
		git: IntegrationGit;
		msg: IntegrateStart;
		entry: Entry;
		ontoRef: string;
		files: string[];
		env: NodeJS.ProcessEnv;
	}): Promise<{ ok: true; resolved: ResolvedConflict[] } | Outcome> {
		if (!ctx.msg.autoResolve) {
			return needsYou('conflict', `merging ${ctx.msg.onto} conflicts in ${ctx.files.join(', ')}, and this repository resolves conflicts by hand`);
		}

		const branchHead = await ctx.git.headSha();
		let gaveUp: string | null = null;

		opts.send({ type: 'integrate.activity', integrationId: ctx.msg.integrationId, label: `Resolving conflicts in ${ctx.files.length} file(s)` });

		const session = await converse({
			msg: ctx.msg,
			entry: ctx.entry,
			prompt: conflictPrompt({
				onto: ctx.msg.onto,
				files: ctx.files,
				own: ctx.msg.criteria,
				others: await othersFor(ctx)
			}),
			env: ctx.env,
			onGiveUp: (reason) => {
				gaveUp = reason;
			}
		});

		if (ctx.entry.cancelled) {
			throw new Cancelled();
		}

		if (gaveUp !== null) {
			return needsYou('conflict', `the conflict session gave up: ${gaveUp}`);
		}

		if (!session.ok) {
			return needsYou('conflict', `the conflict session ended without resolving: ${session.message}`);
		}

		const left = await ctx.git.unresolved(ctx.files);

		if (left.length > 0) {
			return needsYou('conflict', `still conflicting after the session: ${left.join(', ')}`);
		}

		const staged = await ctx.git.stage(ctx.files);

		if (!staged.ok) {
			return needsYou('error', staged.detail);
		}

		const resolved = await Promise.all(
			ctx.files.map(async (file) => ({ file, diff: branchHead === null ? '' : await ctx.git.diffSince({ from: branchHead, file }) }))
		);

		return { ok: true, resolved };
	}

	async function regenerate(ctx: {
		git: IntegrationGit;
		msg: IntegrationStartContext;
		config: ProjectConfig;
		env: NodeJS.ProcessEnv;
		keepOut: string[];
	}): Promise<{ ok: true; regenerated: Regenerated[] } | Outcome> {
		const regenerated: Regenerated[] = [];

		for (const rule of ctx.config.regenerate) {
			const staged = await ctx.git.stageAll(ctx.keepOut);

			if (!staged.ok) {
				return needsYou('error', staged.detail);
			}

			opts.send({ type: 'integrate.activity', integrationId: ctx.msg.integrationId, label: `Regenerating ${rule.name}` });

			const result = await runShell({ command: rule.run, cwd: path.join(ctx.msg.worktreePath, rule.cwd ?? '.'), env: ctx.env });

			if (!result.ok) {
				return needsYou('error', `regenerating ${rule.name} failed (${result.detail}):\n${result.tail}`);
			}

			regenerated.push({ name: rule.name, files: await ctx.git.changedUnder(rule.paths) });
		}

		return { ok: true, regenerated };
	}

	async function checksGreen(ctx: {
		git: IntegrationGit;
		msg: IntegrateStart;
		entry: Entry;
		ontoRef: string;
		config: ProjectConfig | null;
		env: NodeJS.ProcessEnv;
		keepOut: string[];
	}): Promise<{ ok: true; ran: number } | Outcome> {
		const first = await runChecks(ctx);

		if (first.ok) {
			return first;
		}

		if (!ctx.msg.autoResolve) {
			return needsYou('checks', `\`${first.check}\` is red after merging ${ctx.msg.onto}:\n${first.output}`);
		}

		opts.send({ type: 'integrate.activity', integrationId: ctx.msg.integrationId, label: 'Repairing a red check' });

		let gaveUp: string | null = null;

		await converse({
			msg: ctx.msg,
			entry: ctx.entry,
			prompt: repairPrompt({
				onto: ctx.msg.onto,
				check: first.check,
				output: first.output,
				own: ctx.msg.criteria,
				others: await othersFor({ ...ctx, files: [] })
			}),
			env: ctx.env,
			onGiveUp: (reason) => {
				gaveUp = reason;
			}
		});

		if (ctx.entry.cancelled) {
			throw new Cancelled();
		}

		if (gaveUp !== null) {
			return needsYou('checks', `\`${first.check}\` is red after merging ${ctx.msg.onto}, and the repair gave up: ${gaveUp}`);
		}

		const committed = await services.commit.commitAll({
			worktreePath: ctx.msg.worktreePath,
			message: `Integrate ${ctx.msg.onto}: repair checks`,
			keepOut: ctx.keepOut
		});

		if (!committed.ok) {
			return needsYou('error', `could not commit the repair: ${committed.detail}`);
		}

		const second = await runChecks(ctx);

		return second.ok ? second : needsYou('checks', `\`${second.check}\` is still red after one repair:\n${second.output}`);
	}

	async function integrate(msg: IntegrateStart, entry: Entry): Promise<Outcome> {
		const git = getIntegrationGit({ exec: services.exec, worktreePath: msg.worktreePath });
		const keepOut = services.projectEnv.summary().map((set) => envFileFor(set.path));
		const step = (label: string) => opts.send({ type: 'integrate.activity', integrationId: msg.integrationId, label });
		const checkpoint = () => {
			if (entry.cancelled) {
				throw new Cancelled();
			}
		};

		step('Fetching');

		const synced = await syncWithRemote({ exec: services.exec, worktreePath: msg.worktreePath, branch: msg.branch });

		if (!synced.ok) {
			return needsYou('conflict', synced.detail);
		}

		entry.preHead = await git.headSha();

		if (entry.preHead === null) {
			return needsYou('error', 'the worktree has no commit to integrate');
		}

		const resolvedConfig = resolveProjectConfig({ treePath: msg.worktreePath, draft: msg.configDraft });

		if (resolvedConfig.source === 'invalid') {
			return needsYou('error', resolvedConfig.detail);
		}

		const config = resolvedConfig.source === 'none' ? null : resolvedConfig.config;
		const onto = await git.fetchOnto(msg.onto);

		if (!onto.ok) {
			return needsYou('error', onto.detail);
		}

		checkpoint();

		if (await git.contains(onto.value.ref)) {
			const pushed = await git.push(msg.branch);

			return pushed.ok
				? { kind: 'done', frame: { ontoSha: onto.value.sha, headSha: entry.preHead, merged: false, regenerated: [], resolved: [], checks: 'skipped' } }
				: needsYou('error', pushed.detail);
		}

		const environment = await prepareRunEnvironment({ services, config, includeSecrets: true });

		if (!environment.ok) {
			return needsYou('error', environment.detail);
		}

		const globs = (config?.regenerate ?? []).flatMap((rule) => rule.paths);

		step(`Merging ${msg.onto}`);

		const taken = await git.takeGenerated({ ontoRef: onto.value.ref, globs });

		if (!taken.ok) {
			return needsYou('error', taken.detail);
		}

		const merge = await git.merge(onto.value.ref);

		if (!merge.ok) {
			return needsYou('error', merge.detail);
		}

		const generated = new Set(await git.conflictedUnder(globs));
		const theirs = await git.takeTheirs([...generated]);

		if (!theirs.ok) {
			return needsYou('error', theirs.detail);
		}

		checkpoint();

		const real = merge.value.filter((file) => !generated.has(file));
		const resolution = real.length === 0
			? { ok: true as const, resolved: [] }
			: await resolveConflicts({ git, msg, entry, ontoRef: onto.value.ref, files: real, env: environment.env });

		if ('kind' in resolution) {
			return resolution;
		}

		checkpoint();

		if (config !== null) {
			const setup = await services.setupSteps.rerunChanged({
				key: path.basename(msg.worktreePath),
				worktreePath: msg.worktreePath,
				config,
				env: environment.env,
				onStep: (name) => step(`Re-running setup: ${name}`)
			});

			if (!setup.ok) {
				return needsYou('error', setup.message);
			}
		}

		const regenerated = config === null
			? { ok: true as const, regenerated: [] }
			: await regenerate({ git, msg, config, env: environment.env, keepOut });

		if ('kind' in regenerated) {
			return regenerated;
		}

		const committed = await services.commit.commitAll({
			worktreePath: msg.worktreePath,
			message: `Integrate ${msg.onto} into ${msg.branch}`,
			keepOut
		});

		if (!committed.ok) {
			return needsYou('error', `could not commit the integration: ${committed.detail}`);
		}

		checkpoint();

		const checks = await checksGreen({ git, msg, entry, ontoRef: onto.value.ref, config, env: environment.env, keepOut });

		if ('kind' in checks) {
			return checks;
		}

		checkpoint();
		step(`Pushing ${msg.branch}`);

		const pushed = await git.push(msg.branch);

		if (!pushed.ok) {
			return needsYou('error', pushed.detail);
		}

		return {
			kind: 'done',
			frame: {
				ontoSha: onto.value.sha,
				headSha: await git.headSha(),
				merged: true,
				regenerated: regenerated.regenerated,
				resolved: resolution.resolved,
				checks: checks.ran > 0 ? 'passed' : 'skipped'
			}
		};
	}

	function cancel(integrationId: string): void {
		const entry = entries.get(integrationId);

		if (entry) {
			entry.cancelled = true;
			release(entry);
		}
	}

	return {
		async start(msg): Promise<void> {
			if (entries.has(msg.integrationId)) {
				return;
			}

			// In the map before the first await, so a `hello` sent while the fetch is
			// still running names this integration as held.
			const entry: Entry = { cancelled: false, process: null, mcp: null, preHead: null };

			entries.set(msg.integrationId, entry);

			let outcome: Outcome | null;

			try {
				outcome = await integrate(msg, entry);
			} catch (error) {
				outcome = error instanceof Cancelled ? null : needsYou('error', error instanceof Error ? error.message : 'the sync failed');
			}

			release(entry);

			if ((outcome === null || outcome.kind === 'needs_you') && entry.preHead !== null) {
				await getIntegrationGit({ exec: services.exec, worktreePath: msg.worktreePath }).abandon(entry.preHead);
			}

			entries.delete(msg.integrationId);

			if (outcome === null || entry.cancelled) {
				return;
			}

			opts.send(
				outcome.kind === 'done'
					? { type: 'integrate.done', integrationId: msg.integrationId, ...outcome.frame }
					: { type: 'integrate.needs_you', integrationId: msg.integrationId, reason: outcome.reason, detail: outcome.detail }
			);
		},

		cancel,

		cancelAll(): void {
			for (const integrationId of [...entries.keys()]) {
				cancel(integrationId);
			}
		},

		held(): string[] {
			return [...entries.keys()];
		},

		running(): number {
			return entries.size;
		}
	};
}

type IntegrationStartContext = Pick<IntegrateStart, 'integrationId' | 'worktreePath'>;

