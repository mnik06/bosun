import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type Plan } from 'src/types/PlanSchema';

export async function listPlans(opts: { planRepo: PlanRepo; userId: string }): Promise<Plan[]> {
	return opts.planRepo.listOwned(opts.userId);
}
