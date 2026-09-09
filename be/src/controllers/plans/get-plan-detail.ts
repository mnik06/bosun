import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import {
	type Ac,
	type Plan,
	type PlanDecision,
	type PlanMessage,
	type Slice
} from 'src/types/PlanSchema';

export async function getPlanDetail(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	planBlockerRepo: PlanBlockerRepo;
	planDecisionRepo: PlanDecisionRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	id: string;
	projectId: string;
}): Promise<{
	plan: Plan;
	messages: PlanMessage[];
	acs: Ac[];
	slices: Slice[];
	blockedBy: Plan[];
	decisions: PlanDecision[];
}> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.id,
		projectId: opts.projectId
	});
	const [messages, acs, slices, blockedBy, decisions] = await Promise.all([
		opts.planMessageRepo.listByPlan(plan.id),
		opts.acRepo.listByPlan(plan.id),
		opts.sliceRepo.listByPlan(plan.id),
		opts.planBlockerRepo.listBlockers(plan.id),
		opts.planDecisionRepo.listByPlan(plan.id)
	]);

	return { plan, messages, acs, slices, blockedBy, decisions };
}
