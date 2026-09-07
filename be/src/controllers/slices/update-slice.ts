import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Slice } from 'src/types/PlanSchema';

export async function updateSlice(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	socketRegistry: SocketRegistry;
	planId: string;
	sliceId: string;
	userId: string;
	title?: string;
	bodyMd?: string;
	ordinal?: number;
}): Promise<Slice> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.planId,
		userId: opts.userId
	});
	const updated = await opts.sliceRepo.updateInPlan({
		id: opts.sliceId,
		planId: plan.id,
		title: opts.title,
		bodyMd: opts.bodyMd,
		ordinal: opts.ordinal
	});

	if (!updated) {
		throw new HttpError(404, 'Tracer bullet not found');
	}

	await announcePlanArtifact({
		socketRegistry: opts.socketRegistry,
		acRepo: opts.acRepo,
		sliceRepo: opts.sliceRepo,
		planId: plan.id
	});

	return updated;
}
