import { type Plan } from 'src/types/PlanSchema';
import { type PlanState } from 'src/types/PlanStateSchema';
import { type QueueItem } from 'src/types/QueueSchema';

// The queue item outranks the plan row wherever both have an opinion: once a plan
// has been handed to a queue, what it is doing is what its run is doing, and
// `ready` — which the grill sets and never clears — would otherwise keep saying
// the plan is waiting for a person long after it had been built and reviewed.
//
// A cancelled item is not an opinion: the plan went back to being a plan.
export function planStateOf(opts: { plan: Plan; item: QueueItem | null }): PlanState {
	const { plan, item } = opts;

	if (item && item.status !== 'cancelled') {
		if (item.status === 'failed') {
			return 'failed';
		}

		return item.status === 'done' ? 'in_review' : item.status;
	}

	if (plan.status === 'failed') {
		return 'failed';
	}

	if (plan.status === 'planning') {
		return 'planning';
	}

	return plan.confirmedAt === null ? 'drafted' : 'confirmed';
}
