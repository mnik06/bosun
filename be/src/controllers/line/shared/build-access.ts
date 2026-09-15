import { type LineDeps } from 'src/controllers/line/line-deps';
import { type Build } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { orNotFound } from 'src/utils/general';

// 404 rather than 403 for another project's build, matching plans and machines: a
// 403 confirms the row exists.
export async function getOwnedBuild(
	deps: Pick<LineDeps, 'buildRepo' | 'planRepo'>,
	opts: { id: string; projectId: string }
): Promise<{ build: Build; plan: Plan }> {
	const build = await orNotFound(deps.buildRepo.getOwnedById(opts), 'Build not found');
	const plan = await orNotFound(deps.planRepo.getOwnedById({ id: build.planId, projectId: opts.projectId }), 'Build not found');

	return { build, plan };
}
