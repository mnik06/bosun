import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';

export interface MachinePlanSummary {
	number: number;
	title: string | null;
	status: string;
	summary: string | null;
	slices: { ordinal: number; kind: string; title: string }[];
	blockedBy: number[];
}

// The whole point is context a session could not otherwise have: what else has
// been planned for this repository, and what is waiting on what. Bodies are
// truncated rather than sent whole — a machine with thirty plans would otherwise
// hand a session more prior art than the task it was given.
const SUMMARY_CHARS = 600;

export async function listMachinePlans(opts: {
	planRepo: PlanRepo;
	planBlockerRepo: PlanBlockerRepo;
	sliceRepo: SliceRepo;
	machineId: string;
	excludePlanId?: string;
}): Promise<MachinePlanSummary[]> {
	const plans = (await opts.planRepo.listForMachineContext(opts.machineId)).filter(
		(plan) => plan.id !== opts.excludePlanId
	);
	const edges = await opts.planBlockerRepo.listEdges(plans.map((plan) => plan.id));
	const numberById = new Map(plans.map((plan) => [plan.id, plan.number]));

	return Promise.all(
		plans.map(async (plan) => ({
			number: plan.number,
			title: plan.title,
			status: plan.status,
			summary: plan.bodyMd === null ? null : plan.bodyMd.slice(0, SUMMARY_CHARS),
			slices: (await opts.sliceRepo.listByPlan(plan.id)).map((slice) => ({
				ordinal: slice.ordinal,
				kind: slice.kind,
				title: slice.title
			})),
			blockedBy: edges
				.filter((edge) => edge.planId === plan.id)
				.map((edge) => numberById.get(edge.blockedByPlanId))
				.filter((number): number is number => number !== undefined)
		}))
	);
}
