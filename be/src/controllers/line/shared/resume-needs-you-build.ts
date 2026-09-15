import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { type Build, type NeedsYouReason } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';

// Resumes a build parked in `needs_you`, but only for the reason named: a build
// waiting on something else must not be nudged back to `scheduled` by an unrelated
// resolution. The plan is re-announced and the repository rescheduled either way,
// since removing what it was waiting on is news for the line even when the build
// itself was not the one holding for it.
export async function resumeNeedsYouBuild(
	deps: LineDeps,
	opts: { build: Build; plan: Plan; reason: NeedsYouReason }
): Promise<void> {
	const { build, plan, reason } = opts;

	if (build.status === 'needs_you' && build.needsYouReason === reason) {
		const resumed = await deps.buildRepo.update({ id: build.id, status: 'scheduled', needsYouReason: null, failureReason: null });

		if (resumed) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: resumed });
		}
	}

	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });
	await scheduleRepository(deps, { repositoryId: build.repositoryId });
}
