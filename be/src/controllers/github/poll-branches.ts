import { runGithubPatConnectionCall, type GithubPatConnectionGuardDeps } from 'src/controllers/github/shared/pat-connection-guard';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { onPush } from 'src/controllers/line/shared/provider-events';
import { type GithubBranchSnapshotService } from 'src/services/github/github-branch-snapshot.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';
import { type Repository } from 'src/types/RepositorySchema';

export interface BranchPollDeps extends GithubPatConnectionGuardDeps, LineDeps {
	githubPat: GithubPatService;
	githubBranchSnapshot: GithubBranchSnapshotService;
}

// AC-40, AC-41: a conditional GET, `If-None-Match` on the previous poll's
// ETag — a 304 means nothing changed and stops here, so a repository with no
// activity costs exactly the request the conditional-request design promises,
// regardless of whether it also has an active webhook (a missed delivery is
// never the only way a push is noticed).
export async function pollGithubPatBranches(deps: BranchPollDeps, opts: { repository: Repository; connection: GithubPatConnection; pat: string }): Promise<void> {
	const etag = deps.githubBranchSnapshot.getEtag(opts.repository.id);
	const fetched = await runGithubPatConnectionCall(deps, opts.connection, () =>
		deps.githubPat.listBranchHeads({ pat: opts.pat, fullName: opts.repository.fullName, etag })
	);

	if (fetched === null) {
		return;
	}

	const current = new Map(fetched.heads.map((head) => [head.branch, head.sha]));
	const changed = deps.githubBranchSnapshot.diff(opts.repository.id, current, fetched.etag);

	for (const { branch } of changed) {
		await onPush(deps, { repository: opts.repository, branch });
	}
}
