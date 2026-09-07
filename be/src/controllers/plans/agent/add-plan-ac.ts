import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { createAcId } from 'src/services/ids/id.service';
import { type Ac } from 'src/types/PlanSchema';

export async function addPlanAc(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	id: string;
	machineId: string;
	code: string;
	text: string;
}): Promise<Ac> {
	const plan = await getMachinePlan({
		planRepo: opts.planRepo,
		id: opts.id,
		machineId: opts.machineId
	});
	const existing = await opts.acRepo.listByPlan(plan.id);

	if (existing.some((ac) => ac.code === opts.code)) {
		throw new HttpError(409, `${opts.code} already exists on this plan`);
	}

	const created = await opts.acRepo.create({
		id: createAcId(),
		planId: plan.id,
		code: opts.code,
		text: opts.text,
		ordinal: existing.length + 1
	});

	await announcePlanArtifact({ acRepo: opts.acRepo, sliceRepo: opts.sliceRepo, planId: plan.id });

	return created;
}
