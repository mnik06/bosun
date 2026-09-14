import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { providerBranches, startingPoint, type ProviderState } from 'src/controllers/line/shared/dependencies';
import { worktreeSlug } from 'src/controllers/line/shared/lifecycle';
import { type BuildState } from 'src/controllers/line/shared/line-snapshot';
import {
	type Build,
	type BuildStatus,
	type Integration,
	type SliceRun
} from 'src/types/BuildSchema';
import { type Machine } from 'src/types/MachineSchema';
import { DEFAULT_PROJECT_PROFILE } from 'src/types/ProjectProfileSchema';
import { type ServerMsg } from 'src/types/protocol';
import { type Repository } from 'src/types/RepositorySchema';
import { toBranchSlug } from 'src/types/BuildSchema';

const PORT_BASE_START = 4100;
const PORT_BASE_STRIDE = 10;

// Nothing ran on the machine, so there is no half-written worktree to reason about;
// the job goes back and the build is held so a person decides, the same call a
// machine dropping mid-bullet gets.
const UNREACHABLE = 'the machine was not reachable when this was due to start';

type ExecStart = Extract<ServerMsg, { type: 'exec.start' }>;

// `bosun/plan/<n>-<title>`: the branch and its pull request say which plan they are
// without anybody looking it up. Persisted on first use, so a retitled plan does not
// move the branch its commits are already on.
export function planBranch(plan: { number: number; title: string | null }): string {
	const title = toBranchSlug(plan.title ?? '');

	return `bosun/plan/${plan.number}${title === '' ? '' : `-${title}`}`;
}

// Ten ports a build, lowest free range first: a range is back in use the moment the
// build holding it is done, so a machine that has run a hundred plans still hands
// out 4100.
async function allocatePortBase(deps: LineDeps, machineId: string): Promise<number> {
	const used = new Set(await deps.buildRepo.portBasesInUse(machineId));
	let base = PORT_BASE_START;

	while (used.has(base)) {
		base += PORT_BASE_STRIDE;
	}

	return base;
}

async function holdUnreachable(deps: LineDeps, opts: { state: BuildState }): Promise<void> {
	const held = await deps.buildRepo.update({ id: opts.state.build.id, status: 'held', failureReason: UNREACHABLE });

	if (held) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: opts.state.plan.projectId, build: held });
	}
}

async function execStartFrame(
	deps: LineDeps,
	opts: {
		state: BuildState;
		run: SliceRun;
		machine: Machine;
		repository: Repository;
		providers: Map<string, ProviderState>;
		memoryMaxBytes: number | null;
	}
): Promise<ExecStart | null> {
	const { build, plan } = opts.state;
	const [slices, acs, planAcs, decisions, amendments, findings] = await Promise.all([
		deps.sliceRepo.listByPlan(plan.id),
		deps.acRepo.listBySlice(opts.run.sliceId),
		deps.acRepo.listByPlan(plan.id),
		deps.planDecisionRepo.listByPlan(plan.id),
		deps.planAmendmentRepo.listForPlan(plan.id),
		opts.run.phase === 'fix' ? deps.verifyFindingRepo.listForBuild(build.id) : Promise.resolve([])
	]);
	const slice = slices.find((entry) => entry.id === opts.run.sliceId);

	if (!slice || build.worktreePath === null || build.branch === null || build.portBase === null) {
		return null;
	}

	const byId = new Map(slices.map((entry) => [entry.id, entry]));
	const scope = opts.run.acCodes;

	return {
		type: 'exec.start',
		runId: opts.run.id,
		buildId: build.id,
		worktreePath: build.worktreePath,
		branch: build.branch,
		baseRef: `origin/${build.baseBranch ?? opts.repository.defaultBranch}`,
		handsOff: plan.handsOff,
		planId: plan.id,
		sliceId: slice.id,
		planNumber: plan.number,
		planTitle: plan.title ?? 'Untitled plan',
		planBodyMd: plan.bodyMd ?? '',
		profile: DEFAULT_PROJECT_PROFILE,
		configDraft: opts.repository.configDraft,
		policy: { applyMigrations: opts.machine.policy.applyMigrations },
		portBase: build.portBase,
		slice: { ordinal: slice.ordinal, kind: slice.kind, title: slice.title, bodyMd: slice.bodyMd },
		phase: opts.run.phase,
		acs: acs.map((ac) => ({ code: ac.code, text: ac.text })),
		planAcs: planAcs.map((ac) => ({ code: ac.code, text: ac.text })),
		decisions: decisions.map((entry) => ({ fork: entry.fork, chose: entry.chose })),
		doneSlices: opts.state.runs
			.filter((run) => run.phase === null && run.status === 'done')
			.map((run) => ({ ordinal: run.ordinal, title: byId.get(run.sliceId)?.title ?? 'a bullet' })),
		amendments: amendments.map((amendment) => amendment.text),
		mergeIn: providerBranches({ dependencies: opts.state.dependencies, providers: opts.providers }),
		push: true,
		answer: opts.run.answer === null ? null : { questions: opts.run.answer.questions, answers: opts.run.answer.answers },
		findings: findings
			.filter((finding) => finding.status === 'open' && (scope === null || (finding.acCode !== null && scope.includes(finding.acCode))))
			.map((finding) => ({
				id: finding.id,
				acCode: finding.acCode,
				kind: finding.kind,
				reproduction: finding.reproduction,
				severity: finding.severity
			})),
		recheckCodes: opts.run.phase === 'recheck' ? scope ?? [] : [],
		memoryMaxBytes: opts.memoryMaxBytes
	};
}

// The run is claimed first — the claim is what stops a second session in the same
// worktree — and the build takes the status that job holds only once it has.
export async function dispatchRun(
	deps: LineDeps,
	opts: {
		state: BuildState;
		run: SliceRun;
		machine: Machine;
		repository: Repository;
		providers: Map<string, ProviderState>;
		memoryMaxBytes: number | null;
		status: BuildStatus;
	}
): Promise<boolean> {
	const { build, plan } = opts.state;
	const claimed = await deps.sliceRunRepo.claim({ id: opts.run.id, buildId: build.id });

	if (!claimed) {
		return false;
	}

	const moved = build.status === opts.status ? build : await deps.buildRepo.update({ id: build.id, status: opts.status, needsYouReason: null });
	const frame = await execStartFrame(deps, { ...opts, run: claimed, state: { ...opts.state, build: moved ?? build } });

	if (frame === null) {
		await deps.sliceRunRepo.update({ id: claimed.id, status: 'failed', failureReason: 'the plan, its bullet or its worktree is gone', finishedAt: new Date() });
		await deps.buildRepo.update({ id: build.id, status: 'failed', failureReason: 'the plan, its bullet or its worktree is gone', finishedAt: new Date() });

		return true;
	}

	if (!deps.socketRegistry.sendToAgent({ machineId: opts.machine.id, message: frame })) {
		await deps.sliceRunRepo.update({ id: claimed.id, status: 'pending', startedAt: null });
		await holdUnreachable(deps, { state: opts.state });

		return true;
	}

	if (moved && moved !== build) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: moved });
	}

	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });

	return true;
}

export async function dispatchIntegration(
	deps: LineDeps,
	opts: {
		state: BuildState;
		integration: Integration;
		machine: Machine;
		repository: Repository;
		memoryMaxBytes: number | null;
	}
): Promise<boolean> {
	const { build, plan } = opts.state;
	const claimed = await deps.integrationRepo.claim(opts.integration.id);

	if (!claimed) {
		return false;
	}

	const moved = (await deps.buildRepo.update({ id: build.id, status: 'integrating', needsYouReason: null })) ?? build;
	const acs = await deps.acRepo.listByPlan(plan.id);
	const sent =
		moved.worktreePath !== null &&
		moved.branch !== null &&
		moved.portBase !== null &&
		deps.socketRegistry.sendToAgent({
			machineId: opts.machine.id,
			message: {
				type: 'integrate.start',
				integrationId: claimed.id,
				buildId: build.id,
				worktreePath: moved.worktreePath,
				branch: moved.branch,
				onto: claimed.onto,
				configDraft: opts.repository.configDraft,
				autoResolve: opts.repository.autoResolveConflicts,
				criteria: {
					planNumber: plan.number,
					title: plan.title ?? 'Untitled plan',
					acs: acs.map((ac) => ({ code: ac.code, text: ac.text }))
				},
				portBase: moved.portBase,
				memoryMaxBytes: opts.memoryMaxBytes
			}
		});

	if (!sent) {
		await deps.integrationRepo.update({ id: claimed.id, status: 'pending', startedAt: null });
		await holdUnreachable(deps, { state: opts.state });

		return true;
	}

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: moved });

	return true;
}

// A build takes its first slot, or a later one after a hold, an answer or a retry.
// The worktree is asked for whenever this machine has none for it; the branch is cut
// only the first time.
export async function startBuild(
	deps: LineDeps,
	opts: {
		state: BuildState;
		providers: Map<string, ProviderState>;
		machine: Machine;
		repository: Repository;
	}
): Promise<boolean> {
	const { build, plan } = opts.state;
	const fresh = build.startedAt === null;
	const stacking = fresh
		? startingPoint({ dependencies: opts.state.dependencies, providers: opts.providers, defaultBranch: opts.repository.defaultBranch })
		: null;
	const claimed = await deps.buildRepo.transition({
		id: build.id,
		from: ['scheduled'],
		changes: {
			status: 'building',
			machineId: opts.machine.id,
			portBase: build.portBase ?? (await allocatePortBase(deps, opts.machine.id)),
			branch: build.branch ?? planBranch(plan),
			baseBranch: stacking?.baseBranch ?? build.baseBranch ?? opts.repository.defaultBranch,
			startedAt: build.startedAt ?? new Date(),
			failureReason: null,
			needsYouReason: null
		}
	});

	if (!claimed) {
		return false;
	}

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: claimed });

	if (!fresh && claimed.worktreePath !== null) {
		return true;
	}

	return ensureWorktree(deps, { build: claimed, previous: build, plan, machine: opts.machine, repository: opts.repository, stacking });
}

async function ensureWorktree(
	deps: LineDeps,
	opts: {
		build: Build;
		previous: Build;
		plan: BuildState['plan'];
		machine: Machine;
		repository: Repository;
		stacking: { startFrom: string | null; mergeIn: string[] } | null;
	}
): Promise<boolean> {
	const sent = deps.socketRegistry.sendToAgent({
		machineId: opts.machine.id,
		message: {
			type: 'build.worktree.ensure',
			buildId: opts.build.id,
			slug: worktreeSlug(opts.build.id),
			branch: opts.build.branch!,
			fresh: opts.previous.startedAt === null,
			startFrom: opts.stacking?.startFrom ?? null,
			mergeIn: opts.stacking?.mergeIn ?? [],
			configDraft: opts.repository.configDraft
		}
	});

	if (sent) {
		return true;
	}

	const reverted = await deps.buildRepo.update({
		id: opts.build.id,
		status: 'scheduled',
		machineId: opts.previous.machineId,
		portBase: opts.previous.portBase,
		startedAt: opts.previous.startedAt,
		baseBranch: opts.previous.baseBranch
	});

	if (reverted) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: opts.plan.projectId, build: reverted });
	}

	return false;
}

// Re-sent on every connect for a build whose worktree never arrived: the ensure is
// idempotent, so a frame the machine missed corrects itself rather than leaving a
// build holding a slot with nothing to run in.
export async function resendWorktrees(deps: LineDeps, opts: { machine: Machine }): Promise<void> {
	const pending = (await deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: ['building'] })).filter(
		(build) => build.worktreePath === null && build.branch !== null
	);
	const repository = opts.machine.repositoryId ? await deps.repositoryRepo.getById(opts.machine.repositoryId) : null;

	for (const build of pending) {
		deps.socketRegistry.sendToAgent({
			machineId: opts.machine.id,
			message: {
				type: 'build.worktree.ensure',
				buildId: build.id,
				slug: worktreeSlug(build.id),
				branch: build.branch!,
				fresh: false,
				startFrom: null,
				mergeIn: [],
				configDraft: repository?.configDraft ?? null
			}
		});
	}
}
