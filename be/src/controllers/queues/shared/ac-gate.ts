import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';

// A session says it is finished; the criteria say whether it is.
//
// The verify half asks for an account, not for success. A criterion nobody could
// drive — the app would not start, the journey needs data that does not exist —
// is a fact the reviewer needs, and holding the whole branch back for it buries
// finished work over something no retry will change. So a criterion is settled
// when it is either verified or explicitly blocked with a reason, and the pull
// request carries the blocked ones and why.
//
// What still fails is silence. A criterion left neither verified nor explained
// is one nobody looked at, and that is exactly what this gate was built to catch
// — before the pull request, where the work is already merged in somebody's head.
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

	const unaccounted = (await deps.acRepo.listByPlan(opts.planId)).filter(
		(ac) => !ac.verified && ac.blockedReason === null
	);

	return unaccounted.length === 0
		? null
		: `the verify bullet finished without a verdict on ${codes(unaccounted)} — verify each, or record why it could not be driven`;
}

function codes(acs: { code: string }[]): string {
	return acs.map((ac) => ac.code).join(', ');
}
