import { type LineDeps } from 'src/controllers/line/line-deps';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type Plan } from 'src/types/PlanSchema';

// Read at each dispatch, so a bullet already running keeps the tools it was
// started with and the change lands on the next one.
export async function setPlanAfk(deps: LineDeps, opts: { id: string; projectId: string; afk: boolean }): Promise<Plan> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const updated = (await deps.planRepo.update({ id: plan.id, afk: opts.afk })) ?? plan;

	announcePlan({ socketRegistry: deps.socketRegistry, plan: updated });

	return updated;
}
