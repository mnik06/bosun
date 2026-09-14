import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { removeWorktree, stopRunningJobs } from 'src/controllers/line/shared/lifecycle';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';

export async function discardPlan(deps: LineDeps, opts: { id: string; projectId: string }): Promise<void> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const live = await deps.buildRepo.liveForPlan(plan.id);

	// The session goes first. Deleting the rows under a `claude` still writing to the
	// worktree leaves the process alive with nothing left to report against.
	if (live) {
		await stopRunningJobs(deps, { build: live });
		removeWorktree(deps, { build: live });
	}

	if (!(await deps.planRepo.deleteOwned({ id: plan.id, projectId: opts.projectId }))) {
		throw new HttpError(404, 'Plan not found');
	}

	// Fire-and-forget after the row is gone. An agent that never receives this
	// still reaps the session on its own, which is what makes a missed frame
	// self-correcting rather than an orphaned `claude` process.
	deps.socketRegistry.sendToAgent({ machineId: plan.machineId, message: { type: 'plan.cancel', planId: plan.id } });
	deps.planTextService.drop(plan.id);
	deps.socketRegistry.broadcastToPlan({ planId: plan.id, message: { type: 'plan.deleted', planId: plan.id } });
	deps.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'plan.deleted', planId: plan.id } });

	if (live) {
		deps.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'build.deleted', buildId: live.id, planId: plan.id } });
		await scheduleRepository(deps, { repositoryId: live.repositoryId });
	}
}
