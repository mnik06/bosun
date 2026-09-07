import { HttpError } from 'src/api/errors/HttpError';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';

export async function setPlanBlockers(opts: {
	planRepo: PlanRepo;
	planBlockerRepo: PlanBlockerRepo;
	planId: string;
	machineId: string;
	blockedByNumbers: number[];
}): Promise<{ blockedBy: number[] }> {
	const plan = await opts.planRepo.getByIdForMachine({
		id: opts.planId,
		machineId: opts.machineId
	});

	if (!plan) {
		throw new HttpError(404, 'Plan not found');
	}

	const wanted = [...new Set(opts.blockedByNumbers)].filter((number) => number !== plan.number);
	const found = await opts.planRepo.getByNumbers({ userId: plan.userId, numbers: wanted });

	// Named by number and refused by number: a session that mistyped one gets told
	// which, rather than a plan that quietly waits on nothing.
	const missing = wanted.filter(
		(number) => !found.some((candidate) => candidate.number === number)
	);

	if (missing.length > 0) {
		throw new HttpError(400, `No plan numbered ${missing.join(', ')}`);
	}

	// A plan can only be ordered against work in the same checkout. Blocking on
	// another machine's plan would be a dependency the queue has no way to wait
	// for, because nothing there will ever run in this worktree.
	const foreign = found.filter((candidate) => candidate.machineId !== plan.machineId);

	if (foreign.length > 0) {
		throw new HttpError(
			400,
			`Plan ${foreign.map((entry) => entry.number).join(', ')} belongs to a different machine`
		);
	}

	await opts.planBlockerRepo.replace({
		planId: plan.id,
		blockedByPlanIds: found.map((candidate) => candidate.id)
	});

	return { blockedBy: found.map((candidate) => candidate.number).sort((a, b) => a - b) };
}
