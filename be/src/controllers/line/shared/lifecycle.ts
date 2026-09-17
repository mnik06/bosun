import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { recheckDependencyRelease } from 'src/controllers/line/shared/dependency-release';
import {
	BUILD_SLOT_STATUSES,
	hasRunningJob,
	LANE_STATUSES,
	nextJob,
	waitingStatus
} from 'src/controllers/line/shared/next-job';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import { publishPullRequest } from 'src/controllers/line/shared/pull-request';
import { type Build, type IntegrationTrigger } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';

async function announce(deps: LineDeps, opts: { build: Build; plan: Plan }): Promise<void> {
	announceBuild({ socketRegistry: deps.socketRegistry, projectId: opts.plan.projectId, build: opts.build });
	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: opts.plan.projectId, planId: opts.plan.id });
}

// Only one waiting integration per build: a push and the webhook for the same push
// arriving together are one integration, and the later of the two finds nothing new
// to merge anyway.
export async function queueIntegration(
	deps: LineDeps,
	opts: { build: Build; plan: Plan; trigger: IntegrationTrigger; onto: string }
): Promise<boolean> {
	const existing = await deps.integrationRepo.listForBuild(opts.build.id);

	if (existing.some((integration) => integration.status === 'pending')) {
		return false;
	}

	await deps.integrationRepo.create({
		id: deps.idService.createIntegrationId(),
		buildId: opts.build.id,
		trigger: opts.trigger,
		onto: opts.onto
	});
	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: opts.plan.projectId, planId: opts.plan.id });

	return true;
}

// The last build bullet landed. The build keeps its slot through the integration
// that follows, so verify drives integrated code rather than the code the branch
// happened to start from.
export async function completeBuilding(deps: LineDeps, opts: { build: Build; plan: Plan }): Promise<Build> {
	await queueIntegration(deps, { ...opts, trigger: 'built', onto: opts.build.baseBranch ?? 'HEAD' });

	const updated = (await deps.buildRepo.update({ id: opts.build.id, status: 'integrating', builtAt: opts.build.builtAt ?? new Date() })) ?? opts.build;

	await announce(deps, { build: updated, plan: opts.plan });

	if (opts.build.builtAt === null && updated.builtAt !== null) {
		await recheckDependencyRelease(deps, {
			providerPlanId: updated.planId,
			revert: (current) => ({ ...current, build: current.build && { ...current.build, builtAt: null } })
		});
	}

	return updated;
}

// Verification is over — or the plan had none. The pull request opens now, and not
// before: a pull request for work that did not verify would be in front of
// reviewers as though it had.
export async function finishVerification(deps: LineDeps, opts: { build: Build; plan: Plan }): Promise<Build> {
	const verified =
		(await deps.buildRepo.update({
			id: opts.build.id,
			status: 'in_review',
			needsYouReason: null,
			verifiedAt: opts.build.verifiedAt ?? new Date()
		})) ?? opts.build;
	const published = await publishPullRequest(deps, { plan: opts.plan, build: verified });

	await announce(deps, { build: published, plan: opts.plan });
	await notifyBuildStatus(deps, { plan: opts.plan, build: published });

	return published;
}

const ACTIVE_JOB_STATUSES = [...BUILD_SLOT_STATUSES, ...LANE_STATUSES];

// Where a build goes once the job it was running settled: straight on to its next
// bullet while it still holds a build slot, or back to waiting for whatever it has
// to do next. A build a person moved in the meantime — held, cancelled — is left
// where they put it.
export async function settleBuild(deps: LineDeps, opts: { buildId: string }): Promise<Build | null> {
	const build = await deps.buildRepo.getById(opts.buildId);
	const plan = build ? await deps.planRepo.getById(build.planId) : null;

	if (!build || !plan || !ACTIVE_JOB_STATUSES.includes(build.status)) {
		return build;
	}

	const [runs, integrations] = await Promise.all([
		deps.sliceRunRepo.listForBuild(build.id),
		deps.integrationRepo.listForBuild(build.id)
	]);

	if (hasRunningJob({ runs, integrations })) {
		return build;
	}

	const job = nextJob({ runs, integrations });

	if (build.status === 'building' && job?.kind === 'bullet') {
		return build;
	}

	// The verify slice's drive is pending from approval, so "no bullet left" is the
	// test for a finished build, not "nothing left".
	if (build.status === 'building' && build.builtAt === null) {
		return completeBuilding(deps, { build, plan });
	}

	const status = waitingStatus({ build, job });

	if (status === 'in_review' && build.verifiedAt === null) {
		return finishVerification(deps, { build, plan });
	}

	const updated = (await deps.buildRepo.update({ id: build.id, status })) ?? build;

	await announce(deps, { build: updated, plan });
	await notifyBuildStatus(deps, { plan, build: updated });

	return updated;
}

// Whatever the build has running is stopped: its session cancelled and its run put
// back, so it runs again from the last commit. A question goes with the session
// that asked it.
export async function stopRunningJobs(deps: LineDeps, opts: { build: Build }): Promise<void> {
	const [runs, integrations] = await Promise.all([
		deps.sliceRunRepo.listForBuild(opts.build.id),
		deps.integrationRepo.listForBuild(opts.build.id)
	]);

	for (const run of runs.filter((entry) => entry.status === 'running')) {
		if (opts.build.machineId !== null) {
			deps.socketRegistry.sendToAgent({ machineId: opts.build.machineId, message: { type: 'exec.cancel', runId: run.id } });
		}

		deps.runActivity.forget(run.id);
		await deps.sliceRunRepo.update({
			id: run.id,
			status: 'pending',
			failureReason: null,
			questionId: null,
			question: null,
			questionAskedAt: null,
			startedAt: null,
			finishedAt: null
		});
	}

	for (const integration of integrations.filter((entry) => entry.status === 'running')) {
		if (opts.build.machineId !== null) {
			deps.socketRegistry.sendToAgent({ machineId: opts.build.machineId, message: { type: 'integrate.cancel', integrationId: integration.id } });
		}
	}

	await deps.integrationRepo.resetForBuild({ buildId: opts.build.id, from: ['running'] });
}

export function removeWorktree(deps: LineDeps, opts: { build: Build }): void {
	if (opts.build.machineId === null || opts.build.worktreePath === null) {
		return;
	}

	deps.socketRegistry.sendToAgent({
		machineId: opts.build.machineId,
		message: { type: 'build.worktree.remove', buildId: opts.build.id, slug: worktreeSlug(opts.build.id) }
	});
}

export function worktreeSlug(buildId: string): string {
	return buildId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
