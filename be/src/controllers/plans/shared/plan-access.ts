import { HttpError } from 'src/api/errors/HttpError';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type Plan } from 'src/types/PlanSchema';

// 404 rather than 403 for somebody else's plan, matching machines: a 403
// confirms the row exists, which is what turns id guessing into discovery.
export async function getOwnedPlan(opts: {
	planRepo: PlanRepo;
	id: string;
	userId: string;
}): Promise<Plan> {
	const plan = await opts.planRepo.getOwnedById({ id: opts.id, userId: opts.userId });

	if (!plan) {
		throw new HttpError(404, 'Plan not found');
	}

	return plan;
}

export async function getMachinePlan(opts: {
	planRepo: PlanRepo;
	id: string;
	machineId: string;
}): Promise<Plan> {
	const plan = await opts.planRepo.getByIdForMachine({ id: opts.id, machineId: opts.machineId });

	if (!plan) {
		throw new HttpError(404, 'Plan not found');
	}

	return plan;
}
