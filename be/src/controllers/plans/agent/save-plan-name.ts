import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';

// Named early, while the grill is still running. Until this lands the plans list
// shows "Untitled", which tells nobody which of three running sessions is which.
export async function savePlanName(opts: {
	planRepo: PlanRepo;
	socketRegistry: SocketRegistry;
	id: string;
	machineId: string;
	title: string;
}): Promise<Plan> {
	const plan = await getMachinePlan({
		planRepo: opts.planRepo,
		id: opts.id,
		machineId: opts.machineId
	});
	const updated = await opts.planRepo.update({ id: plan.id, title: opts.title });

	if (!updated) {
		throw new HttpError(404, 'Plan not found');
	}

	announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });

	return updated;
}
