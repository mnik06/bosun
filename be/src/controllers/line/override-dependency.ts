import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { getOwnedBuild } from 'src/controllers/line/shared/build-access';

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

	if (build.status === 'needs_you' && build.needsYouReason === 'provider_failed') {
		const resumed = await deps.buildRepo.update({ id: build.id, status: 'scheduled', needsYouReason: null, failureReason: null });

		if (resumed) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: resumed });
		}
	}

	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });
	await scheduleRepository(deps, { repositoryId: build.repositoryId });
}
