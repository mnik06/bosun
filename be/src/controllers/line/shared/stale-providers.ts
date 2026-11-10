import { type BuildState, type RepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { type IntegrationStatus } from 'src/types/BuildSchema';

const CATCHING_UP: IntegrationStatus[] = ['pending', 'running', 'needs_you'];

function catchingUp(opts: { planId: string; byPlan: Map<string, BuildState>; memo: Map<string, boolean> }): boolean {
	const known = opts.memo.get(opts.planId);

	if (known !== undefined) {
		return known;
	}

	opts.memo.set(opts.planId, false);

	const state = opts.byPlan.get(opts.planId);
	const behind =
		state !== undefined &&
		state.build.status !== 'merged' &&
		(state.integrations.some((integration) => CATCHING_UP.includes(integration.status)) ||
			state.dependencies.some(
				(dependency) => dependency.overriddenAt === null && catchingUp({ ...opts, planId: dependency.providerPlanId })
			));

	opts.memo.set(opts.planId, behind);

	return behind;
}

// A new branch is cut from the default branch with every unmerged provider merged
// in, so a provider still catching up with its base — an integration queued,
// running or stuck on it, or on a plan it stacks on — brings its stale copy of
// whatever the base changed since, and conflicts there — in every dependent, each
// stopping on the same conflict. Waiting until the provider settles resolves it
// once, in the provider. A conflict between two providers that are each up to date
// is left to the agent: it cuts the branch anyway and the first bullet integrates it.
export function staleProviders(opts: { state: BuildState; snapshot: RepositorySnapshot }): number[] {
	const byPlan = new Map(opts.snapshot.states.map((entry) => [entry.plan.id, entry]));
	const memo = new Map<string, boolean>();
	const providerIds = new Set(
		opts.state.dependencies.filter((dependency) => dependency.overriddenAt === null).map((dependency) => dependency.providerPlanId)
	);

	return [...providerIds]
		.filter((planId) => catchingUp({ planId, byPlan, memo }))
		.map((planId) => byPlan.get(planId)!.plan.number)
		.sort((a, b) => a - b);
}
