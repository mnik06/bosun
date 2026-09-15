import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { getOwnedBuild } from 'src/controllers/line/shared/build-access';
import { resumeNeedsYouBuild } from 'src/controllers/line/shared/resume-needs-you-build';

// "Run anyway": a person removes a dependency, and who removed it is recorded
// beside it. A plan stopped because its provider failed starts moving again.
export async function overrideDependency(
	deps: LineDeps,
	opts: { buildId: string; dependencyId: string; projectId: string; userId: string }
): Promise<void> {
	const { build, plan } = await getOwnedBuild(deps, { id: opts.buildId, projectId: opts.projectId });
	const overridden = await deps.planDependencyRepo.override({ id: opts.dependencyId, planId: plan.id, userId: opts.userId });

	if (!overridden) {
		throw new HttpError(404, 'Dependency not found, or already removed');
	}

	await resumeNeedsYouBuild(deps, { build, plan, reason: 'provider_failed' });
}
