import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

const RESTARTED = 'the agent restarted while this session was running';

// A planning session is not cancelled by the socket it happened to be started
// over: the `claude` process lives in the agent, keeps its place in the grill
// through a proxy dropping an idle connection or the backend deploying, and
// reports on whatever connection is current. So a close settles nothing, and
// `hello` is where the two sides agree instead — it names every session the
// agent still holds, and everything this machine has marked `planning` that it
// does not name died with the agent process.
//
// Failing on close was what made a grill die of being left alone: the person
// went to lunch, the socket was reaped for idleness, and the plan they were
// halfway through answering came back failed.
//
// An agent too old to send `planIds` holds nothing across a reconnect, so the
// empty default is not a fallback — it is the truth for those agents.
export async function stallMachinePlans(opts: {
	planRepo: PlanRepo;
	planTextService: PlanTextService;
	socketRegistry: SocketRegistry;
	machineId: string;
	// When this socket was registered. A plan created after it was dispatched over
	// it, and may not have reached the agent's map before `hello` was assembled.
	connectedAt: Date;
	heldPlanIds?: string[];
}): Promise<void> {
	const held = new Set(opts.heldPlanIds ?? []);
	const running = await opts.planRepo.listPlanningOnMachine(opts.machineId);
	const stranded = running.filter(
		(plan) => !held.has(plan.id) && plan.createdAt <= opts.connectedAt
	);

	if (stranded.length > 0) {
		const failed = await opts.planRepo.failMany({
			ids: stranded.map((plan) => plan.id),
			reason: RESTARTED
		});

		for (const plan of failed) {
			opts.planTextService.drop(plan.id);
			announcePlan({ socketRegistry: opts.socketRegistry, plan });
		}
	}

	// The other direction. The agent is holding a grill bosun no longer wants —
	// the plan was deleted, or confirmed, while the connection was down and
	// `plan.cancel` could not be delivered. Left alone it is a `claude` holding a
	// port and a credential for a plan nobody will read.
	const alive = new Set(running.map((plan) => plan.id));

	for (const planId of held) {
		if (!alive.has(planId)) {
			opts.socketRegistry.sendToAgent({
				machineId: opts.machineId,
				message: { type: 'plan.cancel', planId }
			});
		}
	}
}
