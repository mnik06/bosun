import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { HttpError } from 'src/api/errors/HttpError';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type Plan } from 'src/types/PlanSchema';

export async function savePlanTitle(opts: {
	planRepo: PlanRepo;
	id: string;
	machineId: string;
	title: string;
	bodyMd: string;
}): Promise<Plan> {
	const plan = await getMachinePlan({
		planRepo: opts.planRepo,
		id: opts.id,
		machineId: opts.machineId
	});
	const updated = await opts.planRepo.update({
		id: plan.id,
		title: opts.title,
		bodyMd: opts.bodyMd
	});

	if (!updated) {
		throw new HttpError(404, 'Plan not found');
	}

	announcePlan(updated);

	return updated;
}
