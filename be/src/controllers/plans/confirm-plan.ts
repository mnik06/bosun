import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';

// The gate between a plan being written and a plan being built. `ready` says the
// session finished; this says a person read what it wrote. Queueing needs both,
// so nothing is executed on the strength of a session's own opinion of its work.
export async function confirmPlan(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
}): Promise<Plan> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.id,
		projectId: opts.projectId
	});

	if (plan.status !== 'ready') {
		throw new HttpError(409, 'This plan is still being written');
	}

	const [acs, slices] = await Promise.all([
		opts.acRepo.listByPlan(plan.id),
		opts.sliceRepo.listByPlan(plan.id)
	]);

	if (acs.length === 0 || slices.length === 0) {
		throw new HttpError(409, 'This plan has nothing to build yet');
	}

	const updated = await opts.planRepo.update({ id: plan.id, confirmedAt: new Date() });

	if (!updated) {
		throw new HttpError(404, 'Plan not found');
	}

	announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });

	return updated;
}
