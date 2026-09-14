import { type OverlapDecisionView } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type OverlapDecision } from 'src/types/BuildSchema';

export async function overlapViews(deps: { planRepo: PlanRepo }, opts: { decisions: OverlapDecision[] }): Promise<OverlapDecisionView[]> {
	const providers = new Map(
		(await deps.planRepo.listByIds([...new Set(opts.decisions.map((decision) => decision.providerPlanId))])).map((plan) => [plan.id, plan])
	);

	return opts.decisions.map((decision) => ({
		...decision,
		providerNumber: providers.get(decision.providerPlanId)?.number ?? 0,
		providerTitle: providers.get(decision.providerPlanId)?.title ?? null
	}));
}
