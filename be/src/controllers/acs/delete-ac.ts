import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export async function deleteAc(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	socketRegistry: SocketRegistry;
	planId: string;
	acId: string;
	userId: string;
}): Promise<void> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.planId,
		userId: opts.userId
	});

	if (!(await opts.acRepo.deleteInPlan({ id: opts.acId, planId: plan.id }))) {
		throw new HttpError(404, 'Acceptance criterion not found');
	}

	await announcePlanArtifact({
		socketRegistry: opts.socketRegistry,
		acRepo: opts.acRepo,
		sliceRepo: opts.sliceRepo,
		planId: plan.id
	});
}
