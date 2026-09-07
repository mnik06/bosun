import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { dropPlanText } from 'src/services/plans/plan-text.service';
import { type Plan } from 'src/types/PlanSchema';

export async function failPlan(opts: {
	planRepo: PlanRepo;
	plan: Plan;
	reason: string;
}): Promise<Plan | null> {
	const updated = await opts.planRepo.update({
		id: opts.plan.id,
		status: 'failed',
		failureReason: opts.reason
	});

	dropPlanText(opts.plan.id);

	if (updated) {
		announcePlan(updated);
	}

	return updated;
}
