import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { getOwnedBuild } from 'src/controllers/line/shared/build-access';
import { finishVerification } from 'src/controllers/line/shared/lifecycle';
import { type Build, type SliceRun } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';

async function failedRecheck(deps: LineDeps, opts: { id: string; projectId: string }): Promise<{ build: Build; plan: Plan; recheck: SliceRun; failing: string[] }> {
	const { build, plan } = await getOwnedBuild(deps, opts);

	if (build.status !== 'needs_you' || build.needsYouReason !== 'recheck_failed') {
		throw new HttpError(409, 'That plan is not stopped on a failed re-check');
	}

	const [runs, acs] = await Promise.all([deps.sliceRunRepo.listForBuild(build.id), deps.acRepo.listByPlan(plan.id)]);
	const recheck = runs.filter((run) => run.phase === 'recheck' && run.status === 'done').at(-1);

	if (!recheck) {
		throw new HttpError(409, 'That plan has no re-check to act on');
	}

	const codes = recheck.acCodes ?? [];

	return { build, plan, recheck, failing: acs.filter((ac) => codes.includes(ac.code) && !ac.verified).map((ac) => ac.code) };
}

// A fix session given only the still-failing criteria's findings, then another
// re-check. Chosen by a person each time, never looped automatically.
export async function fixAgain(deps: LineDeps, opts: { id: string; projectId: string }): Promise<Build> {
	const { build, plan, recheck, failing } = await failedRecheck(deps, opts);

	await deps.sliceRunRepo.createMany([
		{ id: deps.idService.createSliceRunId(), buildId: build.id, sliceId: recheck.sliceId, ordinal: recheck.ordinal, phase: 'fix', acCodes: failing }
	]);

	const moved = (await deps.buildRepo.update({ id: build.id, status: 'waiting_verify', needsYouReason: null, failureReason: null })) ?? build;

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: moved });
	await scheduleRepository(deps, { repositoryId: build.repositoryId });

	return moved;
}

// The criterion is marked blocked with "failed re-check" and the reproduction,
// against whoever accepted it. The gate passes and the pull request lists it under
// Known gaps.
export async function acceptGaps(deps: LineDeps, opts: { id: string; projectId: string; userId: string }): Promise<Build> {
	const { build, plan, recheck, failing } = await failedRecheck(deps, opts);
	const findings = await deps.verifyFindingRepo.listForBuild(build.id);

	for (const code of failing) {
		const latest = findings.filter((finding) => finding.acCode === code).at(-1);
		const reproduction = latest?.reproduction ?? 'it did not hold when driven again';

		await deps.acRepo.markInPlan({ planId: plan.id, code, blockedReason: `failed re-check: ${reproduction}` });

		if (latest) {
			await deps.verifyFindingRepo.update({ id: latest.id, status: 'accepted', acceptedByUserId: opts.userId });
		} else {
			await deps.verifyFindingRepo.create({
				id: deps.idService.createFindingId(),
				buildId: build.id,
				runId: recheck.id,
				acCode: code,
				kind: 'criterion',
				reproduction,
				severity: 'medium'
			}).then(async (created) => deps.verifyFindingRepo.update({ id: created.id, status: 'accepted', acceptedByUserId: opts.userId }));
		}
	}

	const finished = await finishVerification(deps, { build, plan });

	await scheduleRepository(deps, { repositoryId: build.repositoryId });

	return finished;
}
