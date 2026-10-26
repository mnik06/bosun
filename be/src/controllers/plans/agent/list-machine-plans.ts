import { HttpError } from 'src/api/errors/HttpError';
import { planStateOf } from 'src/controllers/line/shared/plan-state';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type PlanDependencyRepo } from 'src/repos/builds/plan-dependency.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type Footprint } from 'src/types/FootprintSchema';
import { type PlanState } from 'src/types/PlanStateSchema';
import { orNotFound } from 'src/utils/general';

interface MachinePlanSummary {
	number: number;
	title: string | null;
	status: string;
	state: PlanState;
	approved: boolean;
	sameRepository: boolean;
	summary: string | null;
	slices: { ordinal: number; kind: string; title: string; foundation: boolean; footprint: Footprint | null }[];
	dependsOn: number[];
}

// Bodies are truncated rather than sent whole — a project with thirty plans would
// otherwise hand a session more prior art than the task it was given. `read_plan`
// fetches one in full.
const SUMMARY_CHARS = 600;

async function machineProject(opts: { machineRepo: MachineRepo; machineId: string }) {
	const machine = await opts.machineRepo.getById(opts.machineId);

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	return machine;
}

// What else is planned in this project and what waits on what: every plan in every
// state, with its footprints. Only approved plans used to show theirs, so a session
// could not see that a sibling still waiting for sign-off already builds the table
// it was about to build too — and planned a second copy of it.
export async function listMachinePlans(opts: {
	planRepo: PlanRepo;
	planDependencyRepo: PlanDependencyRepo;
	sliceRepo: SliceRepo;
	buildRepo: BuildRepo;
	machineRepo: MachineRepo;
	machineId: string;
}): Promise<MachinePlanSummary[]> {
	const machine = await machineProject(opts);
	const plans = await opts.planRepo.listInProject(machine.projectId);
	const ids = plans.map((plan) => plan.id);
	const [builds, dependencies, slices] = await Promise.all([
		opts.buildRepo.latestForPlans(ids),
		opts.planDependencyRepo.listForPlans(ids),
		opts.sliceRepo.listByPlans(ids)
	]);
	const numberById = new Map(plans.map((plan) => [plan.id, plan.number]));

	return plans.map((plan) => ({
		number: plan.number,
		title: plan.title,
		status: plan.status,
		state: planStateOf({ plan, build: builds.get(plan.id) ?? null }),
		approved: plan.approvedAt !== null,
		sameRepository: machine.repositoryId === null ? plan.machineId === machine.id : plan.repositoryId === machine.repositoryId,
		summary: plan.bodyMd === null ? null : plan.bodyMd.slice(0, SUMMARY_CHARS),
		slices: slices
			.filter((slice) => slice.planId === plan.id)
			.map((slice) => ({
				ordinal: slice.ordinal,
				kind: slice.kind,
				title: slice.title,
				foundation: slice.foundation,
				footprint: slice.kind === 'build' ? slice.footprint : null
			})),
		dependsOn: [
			...new Set(
				dependencies
					.filter((dependency) => dependency.planId === plan.id && dependency.overriddenAt === null)
					.flatMap((dependency) => numberById.get(dependency.providerPlanId) ?? [])
			)
		]
	}));
}

// One plan of the project in full — body, criteria, every bullet — for a session
// that found it in `list_plans` and needs more than its summary.
export async function readMachinePlan(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	buildRepo: BuildRepo;
	machineRepo: MachineRepo;
	machineId: string;
	number: number;
}) {
	const machine = await machineProject(opts);
	const plan = await orNotFound(opts.planRepo.getInProjectByNumber({ projectId: machine.projectId, number: opts.number }), `No plan numbered ${opts.number}`);
	const [acs, slices, builds] = await Promise.all([
		opts.acRepo.listByPlan(plan.id),
		opts.sliceRepo.listByPlan(plan.id),
		opts.buildRepo.latestForPlans([plan.id])
	]);

	return {
		number: plan.number,
		title: plan.title,
		status: plan.status,
		state: planStateOf({ plan, build: builds.get(plan.id) ?? null }),
		approved: plan.approvedAt !== null,
		bodyMd: plan.bodyMd,
		acs: acs.map((ac) => ({ code: ac.code, text: ac.text })),
		slices: slices.map((slice) => ({
			ordinal: slice.ordinal,
			kind: slice.kind,
			title: slice.title,
			bodyMd: slice.bodyMd,
			foundation: slice.foundation,
			footprint: slice.kind === 'build' ? slice.footprint : null
		}))
	};
}
