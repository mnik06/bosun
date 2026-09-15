import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { notifyPlanStatus, type PlanNotifyDeps } from 'src/controllers/plans/shared/notify';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type Plan } from 'src/types/PlanSchema';

export async function failPlan(
	opts: PlanNotifyDeps & {
		planRepo: PlanRepo;
		planTextService: PlanTextService;
		plan: Plan;
		reason: string;
	}
): Promise<Plan | null> {
	const updated = await opts.planRepo.update({
		id: opts.plan.id,
		status: 'failed',
		failureReason: opts.reason
	});

	opts.planTextService.drop(opts.plan.id);

	if (updated) {
		announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });
		await notifyPlanStatus(opts, { plan: updated });
	}

	return updated;
}
