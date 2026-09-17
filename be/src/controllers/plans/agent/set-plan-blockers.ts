import { HttpError } from 'src/api/errors/HttpError';
import { type PlanDependencyRepo } from 'src/repos/builds/plan-dependency.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type IdService } from 'src/services/ids/id.service';
import { orNotFound } from 'src/utils/general';

// What a planning session declares: this plan needs another plan's whole feature.
// The finer dependencies — a table, a contract, a module — are detected from
// footprints at approval, never declared by a model.
export async function setPlanBlockers(opts: {
	planRepo: PlanRepo;
	planDependencyRepo: PlanDependencyRepo;
	idService: IdService;
	planId: string;
	machineId: string;
	blockedByNumbers: number[];
}): Promise<{ blockedBy: number[] }> {
	const plan = await orNotFound(
		opts.planRepo.getByIdForMachine({ id: opts.planId, machineId: opts.machineId }),
		'Plan not found'
	);

	const wanted = [...new Set(opts.blockedByNumbers)].filter((number) => number !== plan.number);
	const found = await opts.planRepo.getByNumbers({ projectId: plan.projectId, numbers: wanted });

	// Named by number and refused by number: a session that mistyped one gets told
	// which, rather than a plan that quietly waits on nothing.
	const missing = wanted.filter((number) => !found.some((candidate) => candidate.number === number));

	if (missing.length > 0) {
		throw new HttpError(400, `No plan numbered ${missing.join(', ')}`);
	}

	// A dependency is waited for in a line, and a line belongs to one repository.
	// Waiting on another repository's plan is a wait nothing here can release.
	const foreign = found.filter((candidate) =>
		plan.repositoryId === null ? candidate.machineId !== plan.machineId : candidate.repositoryId !== plan.repositoryId
	);

	if (foreign.length > 0) {
		throw new HttpError(400, `Plan ${foreign.map((entry) => entry.number).join(', ')} belongs to a different repository`);
	}

	await opts.planDependencyRepo.replaceForSource({
		planId: plan.id,
		source: 'planned',
		rows: found.map((candidate) => ({
			id: opts.idService.createDependencyId(),
			planId: plan.id,
			providerPlanId: candidate.id,
			providerSliceId: null,
			source: 'planned' as const,
			reason: `needs #${candidate.number}'s whole feature`
		}))
	});

	return { blockedBy: found.map((candidate) => candidate.number).sort((a, b) => a - b) };
}
