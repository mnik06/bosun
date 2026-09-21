import { HttpError } from 'src/api/errors/HttpError';
import { requireMachineBuild, requireRunningFix } from 'src/controllers/line/agent/shared/agent-build';
import { announceNeedsYou } from 'src/controllers/line/shared/announce';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { type PlanProposal } from 'src/types/PlanProposalSchema';

// Each one is a decision a person has to make before anything happens, so a fix
// session that proposes a plan per finding buries the one that matters. Past the
// cap the session folds what is left into a proposal it already made, or leaves
// it in its report.
export const MAX_PROPOSALS_PER_BUILD = 3;

export async function proposePlan(
	deps: LineDeps,
	opts: { buildId: string; machineId: string; title: string; input: string }
): Promise<PlanProposal> {
	const build = await requireMachineBuild(deps, opts);

	await requireRunningFix(deps, { buildId: build.id, message: 'Plans are proposed by a fix session that is running' });

	const [plan, proposed] = await Promise.all([deps.planRepo.getById(build.planId), deps.planProposalRepo.countForBuild(build.id)]);

	if (!plan) {
		throw new HttpError(404, 'Plan not found');
	}

	if (proposed >= MAX_PROPOSALS_PER_BUILD) {
		throw new HttpError(
			409,
			`this build has already proposed ${MAX_PROPOSALS_PER_BUILD} plans — fold what is left into one of them in your report, or leave it there as a known gap`
		);
	}

	const proposal = await deps.planProposalRepo.create({
		id: deps.idService.createPlanProposalId(),
		projectId: plan.projectId,
		sourcePlanId: plan.id,
		buildId: build.id,
		repositoryId: build.repositoryId,
		title: opts.title,
		input: opts.input
	});

	announceNeedsYou({ socketRegistry: deps.socketRegistry, projectId: plan.projectId });

	return proposal;
}
