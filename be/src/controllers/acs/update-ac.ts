import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type Ac } from 'src/types/PlanSchema';

export async function updateAc(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	planId: string;
	acId: string;
	userId: string;
	text?: string;
	sliceId?: string | null;
}): Promise<Ac> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.planId,
		userId: opts.userId
	});

	// A slice from another plan would move an AC out of its own plan's bullet set
	// and leave both plans failing the every-AC-claimed-once invariant.
	if (opts.sliceId) {
		const slices = await opts.sliceRepo.listByPlan(plan.id);

		if (!slices.some((slice) => slice.id === opts.sliceId)) {
			throw new HttpError(400, 'that tracer bullet is not part of this plan');
		}
	}

	const updated = await opts.acRepo.updateInPlan({
		id: opts.acId,
		planId: plan.id,
		text: opts.text,
		sliceId: opts.sliceId
	});

	if (!updated) {
		throw new HttpError(404, 'Acceptance criterion not found');
	}

	await announcePlanArtifact({ acRepo: opts.acRepo, sliceRepo: opts.sliceRepo, planId: plan.id });

	return updated;
}
