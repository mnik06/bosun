import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

const REASON = 'the agent disconnected mid-session';

// A session is answered over the socket it was started on, so a dropped
// connection is the end of the grill rather than a pause in it. Without this a
// plan sits in `planning` forever with nothing on the other end to finish it.
export async function failMachinePlans(opts: {
	planRepo: PlanRepo;
	planTextService: PlanTextService;
	socketRegistry: SocketRegistry;
	machineId: string;
}): Promise<void> {
	const running = await opts.planRepo.listPlanningOnMachine(opts.machineId);

	if (running.length === 0) {
		return;
	}

	const failed = await opts.planRepo.failMany({
		ids: running.map((plan) => plan.id),
		reason: REASON
	});

	for (const plan of failed) {
		opts.planTextService.drop(plan.id);
		announcePlan({ socketRegistry: opts.socketRegistry, plan });
	}
}
