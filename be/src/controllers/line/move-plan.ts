import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { getBuildRepo } from 'src/repos/builds/build.repo';
import { getPlanRepo } from 'src/repos/plans/plan.repo';
import { type Build, type BuildStatus } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { orNotFound } from 'src/utils/general';

// Nothing of the plan lives on a machine yet: no worktree was cut, so nothing is
// lost by building it elsewhere. A build that has one keeps its machine — its
// commits, its running sessions and its port block are all there.
const UNSTARTED: BuildStatus[] = ['scheduled', 'held', 'needs_you'];

function refusal(opts: { plan: Plan; build: Build | null; repositoryId: string | null }): string | null {
	if (opts.plan.status !== 'ready') {
		return 'A plan moves to another machine once it is written — its planning session runs on this one';
	}

	if (opts.repositoryId === null || opts.repositoryId !== opts.plan.repositoryId) {
		return 'That machine has a different repository checked out';
	}

	if (opts.build && (opts.build.worktreePath !== null || !UNSTARTED.includes(opts.build.status))) {
		return 'This plan has started on its machine — it can move only before work begins';
	}

	return null;
}

export async function movePlan(deps: LineDeps, opts: { id: string; projectId: string; machineId: string }): Promise<Plan> {
	const [plan, machine] = await Promise.all([
		getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId }),
		orNotFound(deps.machineRepo.getOwnedById({ id: opts.machineId, projectId: opts.projectId }), 'Machine not found')
	]);

	if (plan.machineId === machine.id) {
		return plan;
	}

	const live = await deps.buildRepo.liveForPlan(plan.id);
	const refused = refusal({ plan, build: live, repositoryId: machine.repositoryId });

	if (refused) {
		throw new HttpError(409, refused);
	}

	const { moved, build } = await deps.db.transaction(async (tx) => ({
		moved: (await getPlanRepo(tx).update({ id: plan.id, machineId: machine.id })) ?? plan,
		build: live ? await getBuildRepo(tx).update({ id: live.id, machineId: null, portBase: null }) : null
	}));

	announcePlan({ socketRegistry: deps.socketRegistry, plan: moved });

	if (build) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: moved.projectId, build });
	}

	await scheduleMachine(deps, { machineId: machine.id });

	return moved;
}
