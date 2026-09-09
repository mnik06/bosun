import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';
import { type PlanSummary } from 'src/types/PlanSummarySchema';

// Written by a session that read the branch, after every bullet landed. It
// replaces whatever was there: a re-run built different code, and half of an old
// map beside half of a new one describes neither.
export async function savePlanSummary(opts: {
	planRepo: PlanRepo;
	socketRegistry: SocketRegistry;
	id: string;
	machineId: string;
	summary: PlanSummary;
}): Promise<Plan> {
	const plan = await getMachinePlan({
		planRepo: opts.planRepo,
		id: opts.id,
		machineId: opts.machineId
	});
	const updated = await opts.planRepo.saveSummary({
		id: plan.id,
		summary: opts.summary,
		now: new Date()
	});

	if (!updated) {
		throw new HttpError(404, 'Plan not found');
	}

	announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });

	return updated;
}
