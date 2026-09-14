import { type VerifyFindingRepo } from 'src/repos/builds/verify-finding.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type Plan } from 'src/types/PlanSchema';

// A session says it is finished; the criteria and the findings say whether it is.

function codes(entries: { code: string }[]): string {
	return entries.map((entry) => entry.code).join(', ');
}

// A build bullet may not finish while one of its own criteria is unimplemented.
export async function bulletGateFailure(deps: { acRepo: AcRepo }, opts: { sliceId: string }): Promise<string | null> {
	const open = (await deps.acRepo.listBySlice(opts.sliceId)).filter((ac) => !ac.implemented);

	return open.length === 0 ? null : `the bullet finished without marking ${codes(open)} implemented`;
}

// The drive asks for an account, not for success. A criterion is settled when it
// was watched holding, explained as blocked, or reported failing with a
// reproduction — the fix session is given the last kind. What still fails is
// silence: a criterion nobody looked at.
export async function driveGateFailure(
	deps: { acRepo: AcRepo; verifyFindingRepo: VerifyFindingRepo },
	opts: { plan: Plan; buildId: string; runId: string; acCodes: string[] | null }
): Promise<string | null> {
	if (!opts.plan.verifyInUi) {
		return null;
	}

	const [acs, findings] = await Promise.all([
		deps.acRepo.listByPlan(opts.plan.id),
		deps.verifyFindingRepo.listForBuild(opts.buildId)
	]);
	const reported = new Set(
		findings.filter((finding) => finding.runId === opts.runId && finding.acCode !== null).map((finding) => finding.acCode)
	);
	const scope = opts.acCodes === null ? acs : acs.filter((ac) => opts.acCodes!.includes(ac.code));
	const unaccounted = scope.filter((ac) => !ac.verified && ac.blockedReason === null && !reported.has(ac.code));

	return unaccounted.length === 0
		? null
		: `the drive finished without a verdict on ${codes(unaccounted)} — verify each, record why it could not be driven, or report it failing`;
}

// Every finding the fix session was given ends fixed or left with a reason.
export async function fixGateFailure(
	deps: { verifyFindingRepo: VerifyFindingRepo },
	opts: { buildId: string; acCodes: string[] | null }
): Promise<string | null> {
	const open = (await deps.verifyFindingRepo.listForBuild(opts.buildId)).filter(
		(finding) =>
			finding.status === 'open' &&
			(opts.acCodes === null || (finding.acCode !== null && opts.acCodes.includes(finding.acCode)))
	);

	if (open.length === 0) {
		return null;
	}

	return `the fix session finished without resolving ${open.length === 1 ? 'a finding' : `${open.length} findings`} — mark each fixed, or left with the reason`;
}
