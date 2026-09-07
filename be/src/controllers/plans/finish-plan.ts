import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type Plan } from 'src/types/PlanSchema';

// The session claiming it is finished is not the same as the plan being usable,
// so the two invariants the browser cannot check are checked here: a plan was
// actually published, and every AC ended up owned by a tracer bullet.
async function completionFailure(opts: { acRepo: AcRepo; plan: Plan }): Promise<string | null> {
	if (!opts.plan.title || !opts.plan.bodyMd) {
		return 'the session ended without publishing a plan';
	}

	const unassigned = await opts.acRepo.listUnassigned(opts.plan.id);

	if (unassigned.length > 0) {
		return `no tracer bullet claims ${unassigned.map((ac) => ac.code).join(', ')}`;
	}

	return null;
}

export async function finishPlan(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	plan: Plan;
}): Promise<Plan | null> {
	const failure = await completionFailure(opts);
	const updated = await opts.planRepo.update({
		id: opts.plan.id,
		status: failure ? 'failed' : 'ready',
		failureReason: failure
	});

	if (updated) {
		announcePlan(updated);
	}

	return updated;
}
