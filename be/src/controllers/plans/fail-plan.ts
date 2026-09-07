import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';

export async function failPlan(opts: {
	planRepo: PlanRepo;
	planTextService: PlanTextService;
	socketRegistry: SocketRegistry;
	plan: Plan;
	reason: string;
}): Promise<Plan | null> {
	const updated = await opts.planRepo.update({
		id: opts.plan.id,
		status: 'failed',
		failureReason: opts.reason
	});

	opts.planTextService.drop(opts.plan.id);

	if (updated) {
		announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });
	}

	return updated;
}
