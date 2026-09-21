import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceNeedsYou } from 'src/controllers/line/shared/announce';
import { getOpenProposal } from 'src/controllers/plans/shared/proposal-access';
import { startPlan } from 'src/controllers/plans/start-plan';
import { type Plan } from 'src/types/PlanSchema';

// The proposal is checked before the plan exists, so a refused start writes
// nothing, and settled after: a planning session that could not be dispatched
// still consumed it, because the person has already been shown the new plan.
// Two people starting it at once both get a plan; the second `decide` is a no-op.
export async function startProposedPlan(
	deps: LineDeps,
	opts: {
		proposalId: string;
		projectId: string;
		userId: string;
		machineId: string;
		input: string;
		verifyInUi: boolean;
		auto: boolean;
		afk: boolean;
	}
): Promise<Plan> {
	const proposal = await getOpenProposal({ planProposalRepo: deps.planProposalRepo, id: opts.proposalId, projectId: opts.projectId });
	const plan = await startPlan({
		...deps,
		projectId: opts.projectId,
		createdByUserId: opts.userId,
		machineId: opts.machineId,
		input: opts.input,
		verifyInUi: opts.verifyInUi,
		auto: opts.auto,
		afk: opts.afk
	});

	await deps.planProposalRepo.decide({ id: proposal.id, status: 'started', planId: plan.id, decidedByUserId: opts.userId });

	announceNeedsYou({ socketRegistry: deps.socketRegistry, projectId: opts.projectId });

	return plan;
}
