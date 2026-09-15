import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type Plan } from 'src/types/PlanSchema';
import { orNotFound } from 'src/utils/general';

// 404 rather than 403 for somebody else's plan, matching machines: a 403
// confirms the row exists, which is what turns id guessing into discovery.
export async function getOwnedPlan(opts: {
	planRepo: PlanRepo;
	id: string;
	projectId: string;
}): Promise<Plan> {
	return orNotFound(opts.planRepo.getOwnedById({ id: opts.id, projectId: opts.projectId }), 'Plan not found');
}

export async function getMachinePlan(opts: {
	planRepo: PlanRepo;
	id: string;
	machineId: string;
}): Promise<Plan> {
	return orNotFound(opts.planRepo.getByIdForMachine({ id: opts.id, machineId: opts.machineId }), 'Plan not found');
}
