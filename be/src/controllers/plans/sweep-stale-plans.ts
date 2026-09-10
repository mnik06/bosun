import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

// The agent's own cap on a planning session. Kept the same on purpose: this is
// the case where the agent cannot report hitting it.
const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const SWEEP_MS = 10 * 60 * 1000;
const REASON = 'the machine has been unreachable since this session started';

interface Deps {
	planRepo: PlanRepo;
	planTextService: PlanTextService;
	socketRegistry: SocketRegistry;
	log: { error: (context: object, message: string) => void };
}

async function sweep(deps: Deps): Promise<void> {
	const stale = await deps.planRepo.listStalePlanning({
		unseenSince: new Date(Date.now() - SESSION_MAX_MS)
	});

	if (stale.length === 0) {
		return;
	}

	const failed = await deps.planRepo.failMany({
		ids: stale.map((plan) => plan.id),
		reason: REASON
	});

	for (const plan of failed) {
		deps.planTextService.drop(plan.id);
		announcePlan({ socketRegistry: deps.socketRegistry, plan });
	}
}

// A planning session survives a reconnect, so nothing settles a plan on the
// socket closing any more — `stallMachinePlans` settles it when the agent comes
// back and says what it still holds. A machine that never comes back never says
// anything, and the plan would sit in `planning` for good, rendering a question
// nobody is listening for. This is the only clock that reaches that case.
//
// Safe as an in-process interval because the backend deploys `--ha=false`; a
// second instance would double the sweep, which is idempotent, but the socket
// registries would already be split long before that mattered.
export function startStalePlanSweep(deps: Deps): () => void {
	const timer = setInterval(() => {
		void sweep(deps).catch((error: unknown) => {
			deps.log.error({ error }, 'failed sweeping stale planning plans');
		});
	}, SWEEP_MS);

	timer.unref();

	return () => {
		clearInterval(timer);
	};
}
