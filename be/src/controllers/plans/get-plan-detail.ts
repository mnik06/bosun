import { type DependencyView } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { verifyLine } from 'src/controllers/line/schedule';
import { dependencyReleased } from 'src/controllers/line/shared/dependencies';
import { loadRepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { overlapViews } from 'src/controllers/line/shared/overlap-views';
import { planStateOf } from 'src/controllers/line/shared/plan-state';
import { describeReason } from 'src/controllers/line/shared/reason';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { ACTIVE_BUILD_STATUSES, type Build, type PlanDependency, type SliceRun } from 'src/types/BuildSchema';
import { type Plan, type Slice } from 'src/types/PlanSchema';

async function dependencyViews(deps: LineDeps, opts: { dependencies: PlanDependency[] }): Promise<DependencyView[]> {
	const providerIds = [...new Set(opts.dependencies.map((dependency) => dependency.providerPlanId))];
	const [plans, latest, slices] = await Promise.all([
		deps.planRepo.listByIds(providerIds),
		deps.buildRepo.latestForPlans(providerIds),
		deps.sliceRepo.listByPlans(providerIds)
	]);
	const runs = await deps.sliceRunRepo.listForBuilds([...latest.values()].map((build) => build.id));
	const plansById = new Map(plans.map((plan) => [plan.id, plan]));
	const slicesById = new Map(slices.map((slice) => [slice.id, slice]));

	return opts.dependencies.map((dependency) => {
		const plan = plansById.get(dependency.providerPlanId);
		const build = latest.get(dependency.providerPlanId) ?? null;
		const slice = dependency.providerSliceId === null ? undefined : slicesById.get(dependency.providerSliceId);

		return {
			...dependency,
			providerNumber: plan?.number ?? 0,
			providerTitle: plan?.title ?? null,
			providerSliceOrdinal: slice?.ordinal ?? null,
			providerSliceTitle: slice?.title ?? null,
			released: dependencyReleased({
				dependency,
				provider: plan
					? { planId: plan.id, number: plan.number, title: plan.title, build, runs: build ? runs.filter((run) => run.buildId === build.id) : [] }
					: undefined
			})
		};
	});
}

async function reasonFor(deps: LineDeps, build: Build | null): Promise<string | null> {
	if (build === null) {
		return null;
	}

	if (!ACTIVE_BUILD_STATUSES.includes(build.status)) {
		return build.failureReason;
	}

	const snapshot = await loadRepositorySnapshot(deps, { repositoryId: build.repositoryId });
	const state = snapshot?.states.find((entry) => entry.build.id === build.id);

	return snapshot && state ? describeReason({ state, snapshot, verifyLine: verifyLine(snapshot) }) : null;
}

function runDetails(opts: { runs: SliceRun[]; slices: Slice[]; deps: LineDeps }) {
	const byId = new Map(opts.slices.map((slice) => [slice.id, slice]));

	return opts.runs.map((run) => ({
		...run,
		sliceTitle: byId.get(run.sliceId)?.title ?? 'a bullet',
		sliceKind: byId.get(run.sliceId)?.kind ?? ('build' as const),
		activity: opts.deps.runActivity.label(run.id)
	}));
}

async function dependents(deps: LineDeps, plan: Plan) {
	const edges = await deps.planDependencyRepo.listByProviders([plan.id]);
	const plans = await deps.planRepo.listByIds([...new Set(edges.map((edge) => edge.planId))]);

	return plans.map((entry) => ({ planId: entry.id, number: entry.number, title: entry.title }));
}

// A plan is the thing a person follows, so its page carries everything its build
// did — runs, integrations, findings — beside what it waits on and what bosun
// changed about it to fit the others.
export async function getPlanDetail(deps: LineDeps, opts: { id: string; projectId: string }) {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const [messages, acs, slices, decisions, amendments, decisionsOpen, dependencies, latest] = await Promise.all([
		deps.planMessageRepo.listByPlan(plan.id),
		deps.acRepo.listByPlan(plan.id),
		deps.sliceRepo.listByPlan(plan.id),
		deps.planDecisionRepo.listByPlan(plan.id),
		deps.planAmendmentRepo.listForPlan(plan.id),
		deps.overlapDecisionRepo.listForPlan(plan.id),
		deps.planDependencyRepo.listForPlan(plan.id),
		deps.buildRepo.latestForPlans([plan.id])
	]);
	const build = latest.get(plan.id) ?? null;
	const [runs, integrations, findings] = build
		? await Promise.all([
			deps.sliceRunRepo.listForBuild(build.id),
			deps.integrationRepo.listForBuild(build.id),
			deps.verifyFindingRepo.listForBuild(build.id)
		])
		: [[], [], []];
	const asking = runs.find((run) => run.questionId !== null && run.question !== null);

	return {
		plan: { ...plan, state: planStateOf({ plan, build }) },
		messages,
		acs,
		slices,
		decisions,
		build,
		runs: runDetails({ runs, slices, deps }),
		dependencies: await dependencyViews(deps, { dependencies }),
		dependents: await dependents(deps, plan),
		amendments,
		overlapDecisions: await overlapViews(deps, { decisions: decisionsOpen }),
		integrations,
		findings,
		pendingQuestion: asking
			? { runId: asking.id, questionId: asking.questionId!, questions: asking.question!, askedAt: asking.questionAskedAt, released: asking.status !== 'running' }
			: null,
		reason: await reasonFor(deps, build)
	};
}
