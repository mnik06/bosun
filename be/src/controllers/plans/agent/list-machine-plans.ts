import { planStateOf } from 'src/controllers/line/shared/plan-state';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type PlanDependencyRepo } from 'src/repos/builds/plan-dependency.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type Footprint } from 'src/types/FootprintSchema';
import { type PlanState } from 'src/types/PlanStateSchema';

interface MachinePlanSummary {
	number: number;
	title: string | null;
	status: string;
	state: PlanState;
	summary: string | null;
	slices: { ordinal: number; kind: string; title: string; foundation: boolean; footprint: Footprint | null }[];
	dependsOn: number[];
}

// Bodies are truncated rather than sent whole — a repository with thirty plans
// would otherwise hand a session more prior art than the task it was given.
const SUMMARY_CHARS = 600;

const UNMERGED = new Set<PlanState>(['scheduled', 'held', 'building', 'integrating', 'verifying', 'in_review', 'needs_you', 'failed']);

// What else is planned for this repository and what waits on what. Footprints only
// for approved, unmerged plans: those are the pieces a plan written now could
// consume instead of building a second copy.
export async function listMachinePlans(opts: {
	planRepo: PlanRepo;
	planDependencyRepo: PlanDependencyRepo;
	sliceRepo: SliceRepo;
	buildRepo: BuildRepo;
	machineRepo: MachineRepo;
	machineId: string;
}): Promise<MachinePlanSummary[]> {
	const machine = await opts.machineRepo.getById(opts.machineId);
	const plans = await opts.planRepo.listForContext({ machineId: opts.machineId, repositoryId: machine?.repositoryId ?? null });
	const ids = plans.map((plan) => plan.id);
	const [builds, dependencies, slices] = await Promise.all([
		opts.buildRepo.latestForPlans(ids),
		opts.planDependencyRepo.listForPlans(ids),
		opts.sliceRepo.listByPlans(ids)
	]);
	const numberById = new Map(plans.map((plan) => [plan.id, plan.number]));

	return plans.map((plan) => {
		const state = planStateOf({ plan, build: builds.get(plan.id) ?? null });
		const sharesFootprint = plan.approvedAt !== null && UNMERGED.has(state);

		return {
			number: plan.number,
			title: plan.title,
			status: plan.status,
			state,
			summary: plan.bodyMd === null ? null : plan.bodyMd.slice(0, SUMMARY_CHARS),
			slices: slices
				.filter((slice) => slice.planId === plan.id)
				.map((slice) => ({
					ordinal: slice.ordinal,
					kind: slice.kind,
					title: slice.title,
					foundation: slice.foundation,
					footprint: sharesFootprint ? slice.footprint : null
				})),
			dependsOn: [
				...new Set(
					dependencies
						.filter((dependency) => dependency.planId === plan.id && dependency.overriddenAt === null)
						.flatMap((dependency) => numberById.get(dependency.providerPlanId) ?? [])
				)
			]
		};
	});
}
