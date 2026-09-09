import { planStateOf } from 'src/controllers/plans/shared/plan-state';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type Plan } from 'src/types/PlanSchema';
import { type PlanState } from 'src/types/PlanStateSchema';

// One query for every plan's item rather than one per plan: the list is the
// screen that grows, and a lookup per row is the thing that makes it slow later
// without anybody noticing when.
export async function listPlans(opts: {
	planRepo: PlanRepo;
	queueItemRepo: QueueItemRepo;
	projectId: string;
}): Promise<(Plan & { state: PlanState })[]> {
	const plans = await opts.planRepo.listOwned(opts.projectId);
	const items = await opts.queueItemRepo.latestForPlans(plans.map((plan) => plan.id));

	return plans.map((plan) => ({
		...plan,
		state: planStateOf({ plan, item: items.get(plan.id) ?? null })
	}));
}
