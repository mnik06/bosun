import { publishPullRequestToGithub, type PublishPullRequestResult } from 'src/controllers/github/shared/publish-pull-request';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { quickFixSummary } from 'src/controllers/quick-fixes/shared/quick-fix-text';
import { type QuickFix } from 'src/types/QuickFixSchema';
import { clip } from 'src/utils/general';

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

	return clip(body, MAX_BODY);
}

export type QuickFixPrResult = PublishPullRequestResult;

// The same GitHub App plumbing a plan's pull request goes through
// (`openOrUpdatePullRequest`), with none of the AC/decision/coverage shape a
// plan's body carries — a quick fix has no criteria to report against, only
// the bug report it was given. A failure here does not undo the push: the
// branch stands, and the caller decides what a PR-less pushed branch means.
export async function publishQuickFixPr(deps: LineDeps, quickFix: QuickFix): Promise<QuickFixPrResult> {
	return publishPullRequestToGithub(deps, {
		repositoryId: quickFix.repositoryId,
		branch: quickFix.branch,
		baseBranch: quickFix.baseBranch,
		title: quickFixPrTitle(quickFix.description),
		body: quickFixPrBody(quickFix.description)
	});
}
