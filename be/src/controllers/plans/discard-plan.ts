import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export async function discardPlan(opts: {
	planRepo: PlanRepo;
	planTextService: PlanTextService;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
}): Promise<void> {
	const plan = await getOwnedPlan({ planRepo: opts.planRepo, id: opts.id, userId: opts.userId });

	if (!(await opts.planRepo.deleteOwned({ id: plan.id, userId: opts.userId }))) {
		throw new HttpError(404, 'Plan not found');
	}

	// Fire-and-forget after the row is gone. An agent that never receives this
	// still reaps the session when its socket drops, which is what makes a missed
	// frame self-correcting rather than an orphaned `claude` process.
	opts.socketRegistry.sendToAgent({
		machineId: plan.machineId,
		message: { type: 'plan.cancel', planId: plan.id }
	});
	opts.planTextService.drop(plan.id);
	opts.socketRegistry.broadcastToPlan({
		planId: plan.id,
		message: { type: 'plan.deleted', planId: plan.id }
	});
	opts.socketRegistry.broadcastToUi({
		userId: opts.userId,
		message: { type: 'plan.deleted', planId: plan.id }
	});
}
