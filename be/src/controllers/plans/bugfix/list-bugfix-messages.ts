import { type LineDeps } from 'src/controllers/line/line-deps';
import { getLatestBuildForPlan, getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type BugfixMessage } from 'src/types/BugfixSchema';

// Keyed by the plan's latest build, terminal or not: the transcript stays
// visible read-only after a merge or a cancel, on the same terms as the tab
// itself.
export async function listBugfixMessages(deps: LineDeps, opts: { id: string; projectId: string }): Promise<BugfixMessage[]> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const build = await getLatestBuildForPlan({ buildRepo: deps.buildRepo, planId: plan.id });

	return build ? deps.bugfixMessageRepo.listByBuild(build.id) : [];
}
