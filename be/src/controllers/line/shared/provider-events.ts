import { type LineDeps } from 'src/controllers/line/line-deps';
import { queueIntegration } from 'src/controllers/line/shared/lifecycle';
import { markMerged, notifyDependents } from 'src/controllers/line/shared/merge';
import { UNMERGED_BUILT_STATUSES } from 'src/types/BuildSchema';
import { type Repository } from 'src/types/RepositorySchema';

// Shared by both providers' webhook delivery and Azure's branch-refs poll
// (`reconcile-repositories.ts`) — a push is a push whether bosun heard about it
// from GitHub's webhook, Azure's, or by noticing a branch's tip moved on a poll.

// The default branch moved: every unmerged build on it integrates again, so an
// open pull request stays mergeable as the others land.
export async function baseMoved(deps: LineDeps, repository: Repository): Promise<void> {
	const builds = await deps.buildRepo.listForRepository({ repositoryId: repository.id, statuses: UNMERGED_BUILT_STATUSES });

	for (const build of builds.filter((entry) => entry.baseBranch === repository.defaultBranch)) {
		const plan = await deps.planRepo.getById(build.planId);

		if (plan) {
			await queueIntegration(deps, { build, plan, trigger: 'base_moved', onto: repository.defaultBranch });
		}
	}
}

export async function onPush(deps: LineDeps, opts: { repository: Repository; branch: string }): Promise<void> {
	if (opts.branch === opts.repository.defaultBranch) {
		await baseMoved(deps, opts.repository);

		return;
	}

	const build = await deps.buildRepo.findByBranch({ repositoryId: opts.repository.id, branch: opts.branch });

	if (build) {
		await notifyDependents(deps, { build });
	}
}

export async function onPullRequestMerged(deps: LineDeps, opts: { repository: Repository; headBranch: string }): Promise<void> {
	const build = await deps.buildRepo.findByBranch({ repositoryId: opts.repository.id, branch: opts.headBranch });

	if (build) {
		await markMerged(deps, { build });
	}
}
