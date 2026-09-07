import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';

export async function deleteSlice(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	planId: string;
	sliceId: string;
	userId: string;
}): Promise<void> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.planId,
		userId: opts.userId
	});
	const owned = await opts.acRepo.listBySlice(opts.sliceId);

	// Refused rather than orphaning them: an AC nobody delivers is invisible work,
	// so moving them out is a decision the user has to make first.
	if (owned.length > 0) {
		throw new HttpError(
			409,
			`still claims ${owned.map((ac) => ac.code).join(', ')} — move them to another bullet first`
		);
	}

	if (!(await opts.sliceRepo.deleteInPlan({ id: opts.sliceId, planId: plan.id }))) {
		throw new HttpError(404, 'Tracer bullet not found');
	}

	await announcePlanArtifact({ acRepo: opts.acRepo, sliceRepo: opts.sliceRepo, planId: plan.id });
}
