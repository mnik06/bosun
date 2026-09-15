import { type LineDeps } from 'src/controllers/line/line-deps';
import { type ProviderState } from 'src/controllers/line/shared/dependencies';
import {
	ACTIVE_BUILD_STATUSES,
	type Build,
	type Integration,
	type PlanDependency,
	type SliceRun
} from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { type Repository } from 'src/types/RepositorySchema';

export interface BuildState {
	build: Build;
	plan: Plan;
	runs: SliceRun[];
	integrations: Integration[];
	dependencies: PlanDependency[];
}

export interface RepositorySnapshot {
	repository: Repository;
	states: BuildState[];
	// Every plan a live build depends on, and every live build's own plan.
	providers: Map<string, ProviderState>;
}

function group<T>(entries: T[], key: (entry: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>();

	for (const entry of entries) {
		grouped.set(key(entry), [...(grouped.get(key(entry)) ?? []), entry]);
	}

	return grouped;
}

// A provider's state built from its latest build, wherever the caller only has
// its plan id — a repository's own snapshot already has this for a build within
// it, but a dependency can point outside the repository, or the recheck that
// follows a build write needs one provider's state on its own.
export async function loadProviderStates(
	deps: LineDeps,
	opts: { planIds: string[] }
): Promise<Map<string, ProviderState>> {
	if (opts.planIds.length === 0) {
		return new Map();
	}

	const [plans, latest] = await Promise.all([
		deps.planRepo.listByIds(opts.planIds),
		deps.buildRepo.latestForPlans(opts.planIds)
	]);
	const runs = group(await deps.sliceRunRepo.listForBuilds([...latest.values()].map((build) => build.id)), (run) => run.buildId);

	return new Map(
		plans.map((plan) => {
			const build = latest.get(plan.id) ?? null;

			return [plan.id, { planId: plan.id, number: plan.number, title: plan.title, build, runs: build ? runs.get(build.id) ?? [] : [] }];
		})
	);
}

// One read of a repository's line, taken fresh for every scheduling decision. It is
// several queries rather than one join because every decision needs the same few
// shapes, and a pass that works from a stale copy is a pass that admits twice.
export async function loadRepositorySnapshot(
	deps: LineDeps,
	opts: { repositoryId: string }
): Promise<RepositorySnapshot | null> {
	const [repository, builds] = await Promise.all([
		deps.repositoryRepo.getById(opts.repositoryId),
		deps.buildRepo.listForRepository({ repositoryId: opts.repositoryId, statuses: ACTIVE_BUILD_STATUSES })
	]);

	if (!repository) {
		return null;
	}

	const planIds = builds.map((build) => build.planId);
	const buildIds = builds.map((build) => build.id);
	const [plans, runs, integrations, dependencies] = await Promise.all([
		deps.planRepo.listByIds(planIds),
		deps.sliceRunRepo.listForBuilds(buildIds),
		deps.integrationRepo.listForBuilds(buildIds),
		deps.planDependencyRepo.listForPlans(planIds)
	]);
	const plansById = new Map(plans.map((plan) => [plan.id, plan]));
	const runsByBuild = group(runs, (run) => run.buildId);
	const integrationsByBuild = group(integrations, (integration) => integration.buildId);
	const dependenciesByPlan = group(dependencies, (dependency) => dependency.planId);
	const states = builds.flatMap((build) => {
		const plan = plansById.get(build.planId);

		return plan
			? [{
				build,
				plan,
				runs: runsByBuild.get(build.id) ?? [],
				integrations: integrationsByBuild.get(build.id) ?? [],
				dependencies: dependenciesByPlan.get(plan.id) ?? []
			}]
			: [];
	});
	const providers = new Map<string, ProviderState>(
		states.map((state) => [
			state.plan.id,
			{ planId: state.plan.id, number: state.plan.number, title: state.plan.title, build: state.build, runs: state.runs }
		])
	);
	const outside = [...new Set(dependencies.map((dependency) => dependency.providerPlanId))].filter((id) => !providers.has(id));

	for (const [planId, provider] of await loadProviderStates(deps, { planIds: outside })) {
		providers.set(planId, provider);
	}

	return { repository, states, providers };
}
