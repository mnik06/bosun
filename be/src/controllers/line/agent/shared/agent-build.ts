import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { announcePlanChanged } from 'src/controllers/line/shared/announce';
import { type Build } from 'src/types/BuildSchema';

// The build an agent-authorized write names, scoped to the machine the bearer
// token belongs to: a build id alone would let one machine touch another's
// findings or bugs by guessing an id, and a project id is not on the agent's
// side of this boundary at all.
export async function requireMachineBuild(deps: LineDeps, opts: { buildId: string; machineId: string }): Promise<Build> {
	const build = await deps.buildRepo.getById(opts.buildId);

	if (!build || build.machineId !== opts.machineId) {
		throw new HttpError(404, 'Build not found');
	}

	return build;
}

// The nudge every agent-authorized write ends on: the plan page and its
// verification/bug panels refetch what changed rather than being sent it.
export async function announcePlanForBuild(deps: LineDeps, build: Build): Promise<void> {
	const plan = await deps.planRepo.getById(build.planId);

	if (plan) {
		announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });
	}
}
