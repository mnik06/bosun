import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { recheckDependencyRelease } from 'src/controllers/line/shared/dependency-release';
import { gitProviderFailureMessage } from 'src/controllers/line/shared/git-provider-error';
import { queueIntegration, removeWorktree, stopRunningJobs } from 'src/controllers/line/shared/lifecycle';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import { UNMERGED_BUILT_STATUSES, type Build } from 'src/types/BuildSchema';
import { type Repository } from 'src/types/RepositorySchema';

// `failed` too: a failed dependent is retried later, and one left stacked on a
// merged provider's branch builds on it, integrates onto it and opens its pull
// request against it.
async function dependentBuilds(deps: LineDeps, build: Build): Promise<Build[]> {
	const dependencies = await deps.planDependencyRepo.listByProviders([build.planId]);

	return deps.buildRepo.listByPlans({
		planIds: [...new Set(dependencies.map((dependency) => dependency.planId))],
		statuses: [...UNMERGED_BUILT_STATUSES, 'scheduled', 'held', 'building', 'waiting_answer', 'needs_you', 'failed']
	});
}

// A provider's branch moved — a bullet pushed, an integration pushed. Every plan
// stacked on it that is past building integrates onto it again; one still building
// merges it before its next bullet on its own, and integrates onto it only when that
// merge conflicts (`integrateBeforeBullet`).
export async function notifyDependents(deps: LineDeps, opts: { build: Build }): Promise<void> {
	if (opts.build.branch === null) {
		return;
	}

	for (const dependent of await dependentBuilds(deps, opts.build)) {
		const plan = await deps.planRepo.getById(dependent.planId);

		if (plan && dependent.baseBranch === opts.build.branch && UNMERGED_BUILT_STATUSES.includes(dependent.status)) {
			await queueIntegration(deps, { build: dependent, plan, trigger: 'provider_moved', onto: opts.build.branch });
		}
	}
}

async function retarget(deps: LineDeps, opts: { dependent: Build; repository: Repository; defaultBranch: string }): Promise<Build> {
	let failureReason: string | null = null;

	if (opts.dependent.prNumber !== null) {
		try {
			const provider = await deps.gitProviderFor(opts.repository);

			await provider.editPullRequest({ number: opts.dependent.prNumber, base: opts.defaultBranch });
		} catch (error) {
			const message = gitProviderFailureMessage(error);

			if (message === null) {
				throw error;
			}

			failureReason = `its provider merged, but the pull request could not be retargeted: ${message}`;
		}
	}

	return (
		(await deps.buildRepo.update({
			id: opts.dependent.id,
			baseBranch: opts.defaultBranch,
			...(failureReason === null ? {} : { failureReason })
		})) ?? opts.dependent
	);
}

// The pull request merged. Its worktree goes, and every plan stacked on it is
// retargeted to the default branch and brought up to date without anybody touching
// it.
export async function markMerged(deps: LineDeps, opts: { build: Build }): Promise<void> {
	const [repository, plan] = await Promise.all([
		deps.repositoryRepo.getById(opts.build.repositoryId),
		deps.planRepo.getById(opts.build.planId)
	]);

	if (!repository || !plan || opts.build.status === 'merged') {
		return;
	}

	await stopRunningJobs(deps, { build: opts.build, bugfixEndedReason: 'merged' });

	const merged = (await deps.buildRepo.update({ id: opts.build.id, status: 'merged', mergedAt: new Date(), finishedAt: new Date() })) ?? opts.build;

	removeWorktree(deps, { build: merged });
	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: merged });
	await notifyBuildStatus(deps, { plan, build: merged });
	await recheckDependencyRelease(deps, {
		providerPlanId: merged.planId,
		revert: (current) => ({ ...current, build: current.build && { ...current.build, status: opts.build.status } })
	});

	for (const dependent of await dependentBuilds(deps, opts.build)) {
		if (dependent.baseBranch !== opts.build.branch) {
			continue;
		}

		const moved = await retarget(deps, { dependent, repository, defaultBranch: repository.defaultBranch });
		const dependentPlan = await deps.planRepo.getById(moved.planId);

		if (dependentPlan && UNMERGED_BUILT_STATUSES.includes(moved.status)) {
			await queueIntegration(deps, { build: moved, plan: dependentPlan, trigger: 'retarget', onto: repository.defaultBranch });
		}

		if (dependentPlan) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: dependentPlan.projectId, build: moved });
		}
	}
}
