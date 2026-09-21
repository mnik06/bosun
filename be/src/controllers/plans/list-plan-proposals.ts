import { type PlanProposalListEntry } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { type LineDeps } from 'src/controllers/line/line-deps';

export async function listPlanProposals(deps: LineDeps, opts: { projectId: string }): Promise<PlanProposalListEntry[]> {
	const proposals = await deps.planProposalRepo.listOpenForProject(opts.projectId);
	const plans = new Map((await deps.planRepo.listByIds([...new Set(proposals.map((proposal) => proposal.sourcePlanId))])).map((plan) => [plan.id, plan]));

	return proposals.flatMap((proposal) => {
		const source = plans.get(proposal.sourcePlanId);

		return source ? [{ ...proposal, sourcePlanNumber: source.number, sourcePlanTitle: source.title }] : [];
	});
}
