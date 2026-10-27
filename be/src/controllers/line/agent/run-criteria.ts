import { HttpError } from 'src/api/errors/HttpError';
import { requireMachineBuild } from 'src/controllers/line/agent/shared/agent-build';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { driveCriteria, type CriterionState } from 'src/controllers/line/shared/ac-gate';

// What the drive gate will read when the session ends, asked while it can still
// act on it. A drive that compacted lost the criteria list from its prompt, went
// on from the ticket's own numbering, and ended sure it had covered everything
// while ten criteria were never opened.
export async function listRunCriteria(
	deps: LineDeps,
	opts: { buildId: string; runId: string; machineId: string }
): Promise<{ required: boolean; criteria: { code: string; text: string; state: CriterionState }[] }> {
	const build = await requireMachineBuild(deps, opts);
	const [run, plan] = await Promise.all([deps.sliceRunRepo.getById(opts.runId), deps.planRepo.getById(build.planId)]);

	if (!run || !plan || run.buildId !== build.id || (run.phase !== 'drive' && run.phase !== 'recheck')) {
		throw new HttpError(409, 'Criteria are listed for a drive or re-check of this build');
	}

	const criteria = await driveCriteria(deps, {
		planId: plan.id,
		buildId: build.id,
		runId: run.id,
		acCodes: run.phase === 'recheck' ? run.acCodes : null
	});

	return { required: plan.verifyInUi, criteria };
}
