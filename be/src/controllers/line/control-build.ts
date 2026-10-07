import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { getOwnedBuild } from 'src/controllers/line/shared/build-access';
import { removeWorktree, stopRunningJobs } from 'src/controllers/line/shared/lifecycle';
import { nextJob, waitingStatus } from 'src/controllers/line/shared/next-job';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import { getBuildRepo } from 'src/repos/builds/build.repo';
import { getIntegrationRepo } from 'src/repos/builds/integration.repo';
import { getSliceRunRepo } from 'src/repos/builds/slice-run.repo';
import { getVerifyFindingRepo } from 'src/repos/builds/verify-finding.repo';
import { getAcRepo } from 'src/repos/plans/ac.repo';
import { type Build, type BuildStatus } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { orNotFound } from 'src/utils/general';

export type BuildAction = 'hold' | 'release' | 'cancel' | 'front' | 'retry' | 'reverify';

const HOLDABLE: BuildStatus[] = ['scheduled', 'building', 'waiting_answer', 'integrating', 'waiting_verify', 'driving', 'fixing', 'rechecking'];

const CANCELLABLE: BuildStatus[] = [...HOLDABLE, 'held', 'in_review', 'fixing_bugs', 'needs_you', 'failed'];

// A needs-you a retry can clear. An overlap is cleared by its decision, and a failed
// re-check by fix again or accept.
const RETRYABLE_NEEDS_YOU = new Set(['integration', 'checks', 'provider_failed', 'worktree']);

// A verify under way is stopped first, then rebuilt from scratch like a finished
// one. An overlap waits on a decision, not on a verdict.
const VERIFYING: BuildStatus[] = ['waiting_verify', 'waiting_answer', 'driving', 'fixing', 'rechecking'];

const REVERIFIABLE: BuildStatus[] = [...VERIFYING, 'in_review', 'needs_you', 'failed'];

function refuse(build: Build, allowed: BuildStatus[], message: string): void {
	if (!allowed.includes(build.status)) {
		throw new HttpError(409, message);
	}
}

async function waitingFor(deps: Pick<LineDeps, 'sliceRunRepo' | 'integrationRepo'>, build: Build): Promise<BuildStatus> {
	const [runs, integrations] = await Promise.all([
		deps.sliceRunRepo.listForBuild(build.id),
		deps.integrationRepo.listForBuild(build.id)
	]);

	return waitingStatus({ build, job: nextJob({ runs, integrations }) });
}

// Stop is a pause. The running session is cancelled, its bullet goes back to
// pending, the branch and every committed bullet stay, and the plan is held.
async function hold(deps: LineDeps, build: Build): Promise<Build | null> {
	refuse(build, HOLDABLE, 'Only a plan that is waiting in the line or running can be held');
	await stopRunningJobs(deps, { build });

	return deps.buildRepo.update({ id: build.id, status: 'held', failureReason: null });
}

async function release(deps: LineDeps, build: Build): Promise<Build | null> {
	refuse(build, ['held'], 'Only a held plan can be released');

	return deps.buildRepo.update({ id: build.id, status: await waitingFor(deps, build), failureReason: null });
}

// The destructive one: the build leaves the line and its worktree goes. Its branch
// is kept for inspection.
async function cancel(deps: LineDeps, build: Build): Promise<Build | null> {
	refuse(build, CANCELLABLE, 'That plan has already left the line');
	await stopRunningJobs(deps, { build });

	const cancelled = await deps.buildRepo.update({ id: build.id, status: 'cancelled', finishedAt: new Date() });

	if (cancelled) {
		removeWorktree(deps, { build: cancelled });
	}

	return cancelled;
}

async function front(deps: LineDeps, build: Build): Promise<Build | null> {
	refuse(build, ['scheduled', 'held'], 'Only a plan waiting in the line can move to the front');

	return deps.buildRepo.update({ id: build.id, position: await deps.buildRepo.frontPosition(build.repositoryId) });
}

// Keeps what landed and re-arms what did not. A worktree that could not be made is
// made again from scratch, branch and all.
async function retry(deps: LineDeps, build: Build): Promise<Build | null> {
	const retryable = build.status === 'failed' || (build.status === 'needs_you' && RETRYABLE_NEEDS_YOU.has(build.needsYouReason ?? ''));

	if (!retryable) {
		throw new HttpError(409, 'Only a plan that failed, or needs you for something a retry can clear, can be retried');
	}

	await deps.sliceRunRepo.resetUnfinished(build.id);
	await deps.integrationRepo.resetForBuild({ buildId: build.id, from: ['needs_you'] });

	if (build.needsYouReason === 'worktree') {
		return deps.buildRepo.update({ id: build.id, status: 'scheduled', needsYouReason: null, failureReason: null, startedAt: null, worktreePath: null });
	}

	return deps.buildRepo.update({ id: build.id, status: await waitingFor(deps, build), needsYouReason: null, failureReason: null });
}

// The whole verify slice again, from a fresh drive: a verdict reached against a
// database that was never migrated, or a stack that never came up, is not one to
// fix from. Findings and every criterion's verdict go with it, so the new drive
// examines everything. `verifiedAt` is cleared so the pull request is published
// again — updated in place when one is open — once the new verdict lands.
async function reverify(deps: LineDeps, build: Build, plan: Plan): Promise<Build | null> {
	refuse(build, REVERIFIABLE, 'Only a plan verifying, in review, failed or waiting on you can be verified again');

	if (build.status === 'needs_you' && build.needsYouReason === 'overlap') {
		throw new HttpError(409, 'Decide the overlap before verifying again');
	}

	const runs = await deps.sliceRunRepo.listForBuild(build.id);
	const drive = runs.find((run) => run.phase === 'drive');

	if (build.builtAt === null || runs.some((run) => run.phase === null && run.status !== 'done')) {
		throw new HttpError(409, 'Only a plan whose bullets are all built can be verified again');
	}

	if (!drive) {
		throw new HttpError(409, 'This plan has no verify slice');
	}

	// The cancelled session's run goes back to pending, so it is dropped with the
	// rest of the unfinished verify runs below; a result it still sends is ignored.
	if (VERIFYING.includes(build.status)) {
		await stopRunningJobs(deps, { build });
	}

	return deps.db.transaction(async (tx) => {
		const sliceRunRepo = getSliceRunRepo(tx);
		const integrationRepo = getIntegrationRepo(tx);

		await sliceRunRepo.deleteUnfinishedVerifyRuns(build.id);
		await getVerifyFindingRepo(tx).deleteForBuild(build.id);
		await getAcRepo(tx).resetVerification(plan.id);
		await integrationRepo.resetForBuild({ buildId: build.id, from: ['needs_you'] });
		await sliceRunRepo.createMany([
			{ id: deps.idService.createSliceRunId(), buildId: build.id, sliceId: drive.sliceId, ordinal: drive.ordinal, phase: 'drive' }
		]);

		return getBuildRepo(tx).update({
			id: build.id,
			status: await waitingFor({ sliceRunRepo, integrationRepo }, build),
			needsYouReason: null,
			failureReason: null,
			verifiedAt: null
		});
	});
}

const ACTIONS: Record<BuildAction, (deps: LineDeps, build: Build, plan: Plan) => Promise<Build | null>> = {
	hold,
	release,
	cancel,
	front,
	retry,
	reverify
};

export async function controlBuild(deps: LineDeps, opts: { id: string; projectId: string; action: BuildAction }): Promise<Build> {
	const { build, plan } = await getOwnedBuild(deps, opts);
	const updated = await orNotFound(ACTIONS[opts.action](deps, build, plan), 'Build not found');

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: updated });

	// A build cancelled while already `failed` was reported once already: a second
	// push for the same dead build is noise, not news.
	if (opts.action === 'cancel' && build.status !== 'failed') {
		await notifyBuildStatus(deps, { plan, build: updated });
	}

	await scheduleRepository(deps, { repositoryId: updated.repositoryId });

	return (await deps.buildRepo.getById(updated.id)) ?? updated;
}
