import { planStateOf } from 'src/controllers/plans/shared/plan-state';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type Plan } from 'src/types/PlanSchema';
import { type PlanState } from 'src/types/PlanStateSchema';

export interface PlanListEntry extends Plan {
	state: PlanState;
	blockedBy: { number: number; title: string | null }[];
}

// One query for every plan's item rather than one per plan: the list is the
// screen that grows, and a lookup per row is the thing that makes it slow later
// without anybody noticing when.
export async function listPlans(opts: {
	planRepo: PlanRepo;
	planBlockerRepo: PlanBlockerRepo;
	queueItemRepo: QueueItemRepo;
	projectId: string;
}): Promise<PlanListEntry[]> {
	const plans = await opts.planRepo.listOwned(opts.projectId);
	const ids = plans.map((plan) => plan.id);
	const [items, edges] = await Promise.all([
		opts.queueItemRepo.latestForPlans(ids),
		opts.planBlockerRepo.listEdges(ids)
	]);
	const byId = new Map(plans.map((plan) => [plan.id, plan]));

	return plans.map((plan) => ({
		...plan,
		state: planStateOf({ plan, item: items.get(plan.id) ?? null }),
		blockedBy: edges
			.filter((edge) => edge.planId === plan.id)
			.flatMap((edge) => {
				const blocker = byId.get(edge.blockedByPlanId);

				return blocker ? [{ number: blocker.number, title: blocker.title }] : [];
			})
	}));
}
