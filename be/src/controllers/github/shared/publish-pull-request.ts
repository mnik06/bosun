import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { GithubError, type GithubAppService } from 'src/services/github/github-app.service';

export type PublishPullRequestResult = { ok: true; url: string; number: number } | { ok: false; error: string };

// Opened, or updated when one is already open for the branch — its body and its
// base both, so a stacked plan's pull request follows its base as it moves. A
// failure here does not undo the push: the branch stands, and the caller decides
// what a PR-less pushed branch means for whatever it is building on top of it.
export async function publishPullRequestToGithub(
	deps: { repositoryRepo: RepositoryRepo; githubInstallationRepo: GithubInstallationRepo; githubApp: GithubAppService },
	opts: { repositoryId: string; branch: string; baseBranch: string; title: string; body: string }
): Promise<PublishPullRequestResult> {
	const repository = await deps.repositoryRepo.getById(opts.repositoryId);
	const installation = repository?.installationId ? await deps.githubInstallationRepo.getById(repository.installationId) : null;

	if (!repository || repository.installationId === null || repository.githubRepoId === null || !installation) {
		return { ok: false, error: `${opts.branch} is pushed, but this repository is no longer connected to a GitHub installation` };
	}

	try {
		const opened = await deps.githubApp.openOrUpdatePullRequest({
			installationId: installation.installationId,
			githubRepoId: repository.githubRepoId,
			head: opts.branch,
			base: opts.baseBranch,
			title: opts.title,
			body: opts.body
		});

		return { ok: true, url: opened.url, number: opened.number };
	} catch (error) {
		if (!(error instanceof GithubError)) {
			throw error;
		}

		return { ok: false, error: `${opts.branch} is pushed, but the pull request failed: ${error.message}` };
	}
}
