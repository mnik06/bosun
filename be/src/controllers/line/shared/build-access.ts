import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { type Build } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';

// 404 rather than 403 for another project's build, matching plans and machines: a
// 403 confirms the row exists.
export async function getOwnedBuild(
	deps: Pick<LineDeps, 'buildRepo' | 'planRepo'>,
	opts: { id: string; projectId: string }
): Promise<{ build: Build; plan: Plan }> {
	const build = await deps.buildRepo.getOwnedById(opts);
	const plan = build ? await deps.planRepo.getOwnedById({ id: build.planId, projectId: opts.projectId }) : null;

	if (!build || !plan) {
		throw new HttpError(404, 'Build not found');
	}

	return { build, plan };
}
