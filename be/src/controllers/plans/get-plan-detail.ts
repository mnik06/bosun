import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type Ac, type Plan, type PlanMessage, type Slice } from 'src/types/PlanSchema';

export async function getPlanDetail(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	planBlockerRepo: PlanBlockerRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	id: string;
	userId: string;
}): Promise<{
	plan: Plan;
	messages: PlanMessage[];
	acs: Ac[];
	slices: Slice[];
	blockedBy: Plan[];
}> {
	const plan = await getOwnedPlan({ planRepo: opts.planRepo, id: opts.id, userId: opts.userId });
	const [messages, acs, slices, blockedBy] = await Promise.all([
		opts.planMessageRepo.listByPlan(plan.id),
		opts.acRepo.listByPlan(plan.id),
		opts.sliceRepo.listByPlan(plan.id),
		opts.planBlockerRepo.listBlockers(plan.id)
	]);

	return { plan, messages, acs, slices, blockedBy };
}
