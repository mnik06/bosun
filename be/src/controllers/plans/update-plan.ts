import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';

export async function updatePlan(opts: {
	planRepo: PlanRepo;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
	title?: string;
	bodyMd?: string;
}): Promise<Plan> {
	await getOwnedPlan({ planRepo: opts.planRepo, id: opts.id, userId: opts.userId });

	const updated = await opts.planRepo.update({
		id: opts.id,
		title: opts.title,
		bodyMd: opts.bodyMd
	});

	if (!updated) {
		throw new HttpError(404, 'Plan not found');
	}

	announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });

	return updated;
}
