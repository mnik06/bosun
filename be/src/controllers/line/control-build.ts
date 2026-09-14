import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { getOwnedBuild } from 'src/controllers/line/shared/build-access';
import { removeWorktree, stopRunningJobs } from 'src/controllers/line/shared/lifecycle';
import { nextJob, waitingStatus } from 'src/controllers/line/shared/next-job';
import { type Build, type BuildStatus } from 'src/types/BuildSchema';

export type BuildAction = 'hold' | 'release' | 'cancel' | 'front' | 'retry';

const HOLDABLE: BuildStatus[] = ['scheduled', 'building', 'waiting_answer', 'integrating', 'waiting_verify', 'driving', 'fixing', 'rechecking'];

const CANCELLABLE: BuildStatus[] = [...HOLDABLE, 'held', 'in_review', 'needs_you', 'failed'];

// A needs-you a retry can clear. An overlap is cleared by its decision, and a failed
// re-check by fix again or accept.
const RETRYABLE_NEEDS_YOU = new Set(['integration', 'checks', 'provider_failed', 'worktree']);

function refuse(build: Build, allowed: BuildStatus[], message: string): void {
	if (!allowed.includes(build.status)) {
		throw new HttpError(409, message);
	}
}

async function waitingFor(deps: LineDeps, build: Build): Promise<BuildStatus> {
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

const ACTIONS: Record<BuildAction, (deps: LineDeps, build: Build) => Promise<Build | null>> = { hold, release, cancel, front, retry };

export async function controlBuild(deps: LineDeps, opts: { id: string; projectId: string; action: BuildAction }): Promise<Build> {
	const { build, plan } = await getOwnedBuild(deps, opts);
	const updated = await ACTIONS[opts.action](deps, build);

	if (!updated) {
		throw new HttpError(404, 'Build not found');
	}

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: updated });
	await scheduleRepository(deps, { repositoryId: updated.repositoryId });

	return (await deps.buildRepo.getById(updated.id)) ?? updated;
}
