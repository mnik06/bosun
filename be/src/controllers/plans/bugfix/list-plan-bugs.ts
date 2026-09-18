import { type LineDeps } from 'src/controllers/line/line-deps';
import { getLatestBuildForPlan, getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type PlanBug } from 'src/types/BugfixSchema';

// Keyed by the plan's latest build, on the same terms as `listBugfixMessages`:
// the list stays visible read-only once the build is past bug fixing.
export async function listPlanBugs(deps: LineDeps, opts: { id: string; projectId: string }): Promise<PlanBug[]> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const build = await getLatestBuildForPlan({ buildRepo: deps.buildRepo, planId: plan.id });

	return build ? deps.planBugRepo.listForBuild(build.id) : [];
}
