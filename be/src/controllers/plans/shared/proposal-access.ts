import { HttpError } from 'src/api/errors/HttpError';
import { type PlanProposalRepo } from 'src/repos/plans/plan-proposal.repo';
import { type PlanProposal } from 'src/types/PlanProposalSchema';

// 404 for another project's proposal on the same terms as `getOwnedPlan`; 409
// once somebody has already started or dismissed it, so a stale page cannot
// start a second plan from one proposal.
export async function getOpenProposal(opts: {
	planProposalRepo: PlanProposalRepo;
	id: string;
	projectId: string;
}): Promise<PlanProposal> {
	const proposal = await opts.planProposalRepo.getById(opts.id);

	if (!proposal || proposal.projectId !== opts.projectId) {
		throw new HttpError(404, 'Proposal not found');
	}

	if (proposal.status !== 'open') {
		throw new HttpError(409, `this proposal was already ${proposal.status}`);
	}

	return proposal;
}
