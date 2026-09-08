import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';

// A session says it is finished; the criteria say whether it is. A build bullet
// that leaves one of its own criteria unticked has not delivered it, and a
// verify bullet that leaves one unverified has not driven the feature — both are
// caught here rather than at the pull request, where the work is already merged
// in somebody's head.
export async function acGateFailure(
	deps: { planRepo: PlanRepo; sliceRepo: SliceRepo; acRepo: AcRepo },
	opts: { planId: string; machineId: string; sliceId: string }
): Promise<string | null> {
	const plan = await deps.planRepo.getByIdForMachine({
		id: opts.planId,
		machineId: opts.machineId
	});

	if (!plan) {
		return null;
	}

	const slices = await deps.sliceRepo.listByPlan(opts.planId);
	const slice = slices.find((entry) => entry.id === opts.sliceId);

	if (!slice) {
		return null;
	}

	if (slice.kind !== 'verify') {
		const owned = await deps.acRepo.listBySlice(opts.sliceId);
		const open = owned.filter((ac) => !ac.implemented);

		return open.length === 0
			? null
			: `the bullet finished without marking ${codes(open)} implemented`;
	}

	if (!plan.verifyInUi) {
		return null;
	}

	const unverified = (await deps.acRepo.listByPlan(opts.planId)).filter((ac) => !ac.verified);

	return unverified.length === 0
		? null
		: `the verify bullet finished without verifying ${codes(unverified)}`;
}

function codes(acs: { code: string }[]): string {
	return acs.map((ac) => ac.code).join(', ');
}
