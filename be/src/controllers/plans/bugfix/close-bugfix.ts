import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { nextJob, waitingStatus } from 'src/controllers/line/shared/next-job';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';

// Ends the build's live session, if any, always by flipping the session's row
// away from `running` before the build's own status moves — a
// `report_bugs`/`update_bug_status` call arriving after the row flip is what a
// later bullet gates on, not this reply. Reverting to whatever the build's
// pending work says next (`waitingStatus`, the same call `release` in
// `control-build.ts` makes) is what lets an integration a webhook queued while
// the session ran start the moment it ends, rather than wait for an unrelated
// nudge.
export async function closeBugfixSession(deps: LineDeps, opts: { id: string; projectId: string }): Promise<void> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const build = await deps.buildRepo.liveForPlan(plan.id);
	const session = build ? await deps.bugfixSessionRepo.getRunningForBuild(build.id) : null;

	if (!build || !session) {
		throw new HttpError(409, 'there is no live bug-fixing session to end');
	}

	const closed = await deps.bugfixSessionRepo.close({ id: session.id, endedReason: 'user_closed' });

	if (!closed) {
		throw new HttpError(409, 'there is no live bug-fixing session to end');
	}

	const [runs, integrations] = await Promise.all([
		deps.sliceRunRepo.listForBuild(build.id),
		deps.integrationRepo.listForBuild(build.id)
	]);
	const status = waitingStatus({ build, job: nextJob({ runs, integrations }) });
	const reverted = await deps.buildRepo.transition({ id: build.id, from: ['fixing_bugs'], changes: { status, needsYouReason: null } });

	// The session's row is already closed above, so this build can only still be
	// `fixing_bugs` if something outside this session moved it first — nothing in
	// this bullet does that, and a later bullet's teardown must not find a build
	// silently left behind.
	if (!reverted) {
		throw new Error(`build ${build.id} was not fixing_bugs when its bug-fixing session closed`);
	}

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: reverted });

	if (build.machineId === null) {
		return;
	}

	deps.socketRegistry.sendToAgent({
		machineId: build.machineId,
		message: { type: 'bugfix.cancel', sessionId: session.id, buildId: build.id }
	});

	await scheduleMachine(deps, { machineId: build.machineId });
}
