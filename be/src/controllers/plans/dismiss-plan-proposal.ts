import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceNeedsYou } from 'src/controllers/line/shared/announce';
import { getOpenProposal } from 'src/controllers/plans/shared/proposal-access';
import { type PlanProposal } from 'src/types/PlanProposalSchema';

export async function dismissPlanProposal(
	deps: LineDeps,
	opts: { id: string; projectId: string; userId: string }
): Promise<PlanProposal> {
	const proposal = await getOpenProposal({ planProposalRepo: deps.planProposalRepo, id: opts.id, projectId: opts.projectId });
	const dismissed = await deps.planProposalRepo.decide({ id: proposal.id, status: 'dismissed', planId: null, decidedByUserId: opts.userId });

	if (!dismissed) {
		throw new HttpError(409, 'this proposal was decided by somebody else first');
	}

	announceNeedsYou({ socketRegistry: deps.socketRegistry, projectId: opts.projectId });

	return dismissed;
}
