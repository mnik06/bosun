import { type LineDeps } from 'src/controllers/line/line-deps';
import { quickFixSummary } from 'src/controllers/quick-fixes/shared/quick-fix-text';
import { GithubError } from 'src/services/github/github-app.service';
import { type QuickFix } from 'src/types/QuickFixSchema';

// GitHub refuses a body over 65536 characters; a bug report pasted in full is
// nowhere near that, but the cap is cheap insurance against one that is.
const MAX_BODY = 60_000;

function quickFixPrTitle(description: string): string {
	const summary = quickFixSummary(description);

	return summary === '' ? 'Quick fix' : `Quick fix: ${summary}`;
}

function quickFixPrBody(description: string): string {
	const body = [
		description.trim() || '_No description given._',
		'_Quick fix — planned and executed by bosun outside any plan._'
	].join('\n\n');

	return body.length <= MAX_BODY ? body : `${body.slice(0, MAX_BODY).trimEnd()}…`;
}

export type QuickFixPrResult = { ok: true; url: string } | { ok: false; error: string };

// The same GitHub App plumbing a plan's pull request goes through
// (`openOrUpdatePullRequest`), with none of the AC/decision/coverage shape a
// plan's body carries — a quick fix has no criteria to report against, only
// the bug report it was given. A failure here does not undo the push: the
// branch stands, and the caller decides what a PR-less pushed branch means.
export async function publishQuickFixPr(deps: LineDeps, quickFix: QuickFix): Promise<QuickFixPrResult> {
	const repository = await deps.repositoryRepo.getById(quickFix.repositoryId);
	const installation = repository ? await deps.githubInstallationRepo.getById(repository.installationId) : null;

	if (!repository || !installation) {
		return { ok: false, error: `${quickFix.branch} is pushed, but this repository is no longer connected to a GitHub installation` };
	}

	try {
		const opened = await deps.githubApp.openOrUpdatePullRequest({
			installationId: installation.installationId,
			githubRepoId: repository.githubRepoId,
			head: quickFix.branch,
			base: quickFix.baseBranch,
			title: quickFixPrTitle(quickFix.description),
			body: quickFixPrBody(quickFix.description)
		});

		return { ok: true, url: opened.url };
	} catch (error) {
		if (!(error instanceof GithubError)) {
			throw error;
		}

		return { ok: false, error: `${quickFix.branch} is pushed, but the pull request failed: ${error.message}` };
	}
}
