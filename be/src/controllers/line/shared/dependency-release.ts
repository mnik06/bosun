import { type LineDeps } from 'src/controllers/line/line-deps';
import { dependencyReleased, type ProviderState } from 'src/controllers/line/shared/dependencies';
import { loadProviderStates } from 'src/controllers/line/shared/line-snapshot';
import { notifyPlanUnblocked } from 'src/controllers/line/shared/notify';
import { type PlanDependency } from 'src/types/BuildSchema';

function byPlan(dependencies: PlanDependency[]): Map<string, PlanDependency[]> {
	const grouped = new Map<string, PlanDependency[]>();

	for (const dependency of dependencies) {
		grouped.set(dependency.planId, [...(grouped.get(dependency.planId) ?? []), dependency]);
	}

	return grouped;
}

function fullyReleased(opts: { dependencies: PlanDependency[]; providers: Map<string, ProviderState> }): boolean {
	return opts.dependencies.every((dependency) => dependencyReleased({ dependency, provider: opts.providers.get(dependency.providerPlanId) }));
}

// Called after any build write that can flip `dependencyReleased` from false to
// true for one provider plan: its build reaching `merged`, its `builtAt` being
// set, or one of its bullets landing. `revert` rebuilds that one provider's
// state as it was immediately before this write; every other provider a
// dependent plan waits on is read fresh for both the before and the after
// check, since this write cannot have changed them. That is what keeps a
// dependent already fully released by an earlier write from being renotified
// by a later, unrelated write against the same provider.
export async function recheckDependencyRelease(
	deps: LineDeps,
	opts: { providerPlanId: string; revert: (current: ProviderState) => ProviderState }
): Promise<void> {
	const outgoing = await deps.planDependencyRepo.listByProviders([opts.providerPlanId]);
	const dependentPlanIds = [...new Set(outgoing.map((dependency) => dependency.planId))];

	if (dependentPlanIds.length === 0) {
		return;
	}

	const allDependencies = await deps.planDependencyRepo.listForPlans(dependentPlanIds);
	const providerIds = [...new Set(allDependencies.map((dependency) => dependency.providerPlanId))];
	const after = await loadProviderStates(deps, { planIds: providerIds });
	const current = after.get(opts.providerPlanId);

	if (!current) {
		return;
	}

	const before = new Map(after);

	before.set(opts.providerPlanId, opts.revert(current));

	const dependenciesByPlan = byPlan(allDependencies);

	for (const planId of dependentPlanIds) {
		const dependencies = dependenciesByPlan.get(planId) ?? [];

		if (!fullyReleased({ dependencies, providers: after }) || fullyReleased({ dependencies, providers: before })) {
			continue;
		}

		const plan = await deps.planRepo.getById(planId);

		if (plan) {
			await notifyPlanUnblocked(deps, { plan });
		}
	}
}
