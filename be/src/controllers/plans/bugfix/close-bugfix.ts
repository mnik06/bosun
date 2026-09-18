import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { endRunningBugfixSession, revertBuildFromBugfix } from 'src/controllers/plans/bugfix/shared/end-bugfix-session';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';

// Ends the build's live session, if any, always by flipping the session's row
// away from `running` before the build's own status moves — a
// `report_bugs`/`update_bug_status` call arriving after the row flip is what a
// later bullet gates on, not this reply. Reverting to whatever the build's
// pending work says next is what lets an integration a webhook queued while
// the session ran start the moment it ends, rather than wait for an unrelated
// nudge.
export async function closeBugfixSession(deps: LineDeps, opts: { id: string; projectId: string }): Promise<void> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const build = await deps.buildRepo.liveForPlan(plan.id);
	const session = build ? await deps.bugfixSessionRepo.getRunningForBuild(build.id) : null;

	if (!build || !session) {
		throw new HttpError(409, 'there is no live bug-fixing session to end');
	}

	const closed = await endRunningBugfixSession(deps, {
		buildId: build.id,
		planId: plan.id,
		machineId: build.machineId,
		session,
		endedReason: 'user_closed'
	});

	if (!closed) {
		throw new HttpError(409, 'there is no live bug-fixing session to end');
	}

	const reverted = await revertBuildFromBugfix(deps, { build, plan });

	// The session's row is already closed above, so this build can only still be
	// `fixing_bugs` if something outside this session moved it first — nothing in
	// this bullet does that, and a later bullet's teardown must not find a build
	// silently left behind.
	if (!reverted) {
		throw new Error(`build ${build.id} was not fixing_bugs when its bug-fixing session closed`);
	}
}
