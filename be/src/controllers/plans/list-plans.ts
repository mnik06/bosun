import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type Plan } from 'src/types/PlanSchema';

export async function listPlans(opts: { planRepo: PlanRepo; projectId: string }): Promise<Plan[]> {
	return opts.planRepo.listOwned(opts.projectId);
}
