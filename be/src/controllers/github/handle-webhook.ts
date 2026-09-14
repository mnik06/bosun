import { z } from 'zod';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { queueIntegration } from 'src/controllers/line/shared/lifecycle';
import { markMerged, notifyDependents } from 'src/controllers/line/shared/merge';
import { UNMERGED_BUILT_STATUSES } from 'src/types/BuildSchema';
import { type Repository } from 'src/types/RepositorySchema';

const PushSchema = z.object({
	ref: z.string(),
	repository: z.object({ id: z.number() })
});

const PullRequestSchema = z.object({
	action: z.string(),
	pull_request: z.object({
		merged: z.boolean().default(false),
		head: z.object({ ref: z.string() })
	}),
	repository: z.object({ id: z.number() })
});

// The default branch moved: every unmerged build on it integrates again, so an open
// pull request stays mergeable as the others land.
async function baseMoved(deps: LineDeps, repository: Repository): Promise<void> {
	const builds = await deps.buildRepo.listForRepository({ repositoryId: repository.id, statuses: UNMERGED_BUILT_STATUSES });

	for (const build of builds.filter((entry) => entry.baseBranch === repository.defaultBranch)) {
		const plan = await deps.planRepo.getById(build.planId);

		if (plan) {
			await queueIntegration(deps, { build, plan, trigger: 'base_moved', onto: repository.defaultBranch });
		}
	}
}

async function onPush(deps: LineDeps, opts: { repository: Repository; branch: string }): Promise<void> {
	if (opts.branch === opts.repository.defaultBranch) {
		await baseMoved(deps, opts.repository);

		return;
	}

	const provider = await deps.buildRepo.findByBranch({ repositoryId: opts.repository.id, branch: opts.branch });

	if (provider) {
		await notifyDependents(deps, { build: provider });
	}
}

async function onPullRequest(deps: LineDeps, opts: { repository: Repository; payload: z.infer<typeof PullRequestSchema> }): Promise<void> {
	if (opts.payload.action !== 'closed' || !opts.payload.pull_request.merged) {
		return;
	}

	const build = await deps.buildRepo.findByBranch({ repositoryId: opts.repository.id, branch: opts.payload.pull_request.head.ref });

	if (build) {
		await markMerged(deps, { build });
	}
}

// A delivery names the repository by GitHub's id, and one repository can be
// connected to more than one project — each gets the event. Anything that does not
// parse is ignored: GitHub sends events this does not subscribe to while an App's
// settings are being changed, and a 4xx only fills its delivery log.
export async function handleGithubWebhook(deps: LineDeps, opts: { event: string | undefined; payload: unknown }): Promise<void> {
	const push = opts.event === 'push' ? PushSchema.safeParse(opts.payload) : null;
	const pull = opts.event === 'pull_request' ? PullRequestSchema.safeParse(opts.payload) : null;
	const parsed = push?.success ? push.data : pull?.data;

	if (!parsed) {
		return;
	}

	const githubRepoId = parsed.repository.id;

	for (const repository of await deps.repositoryRepo.listByGithubRepoId(githubRepoId)) {
		if (push?.success && push.data.ref.startsWith('refs/heads/')) {
			await onPush(deps, { repository, branch: push.data.ref.slice('refs/heads/'.length) });
		}

		if (pull?.success) {
			await onPullRequest(deps, { repository, payload: pull.data });
		}

		await scheduleRepository(deps, { repositoryId: repository.id });
	}
}
