// The GitHub PAT sibling to `azureBranchSnapshot`: a repository's previous ETag
// is what makes each poll conditional (AC-40), and its previous branch->sha map
// is what a 200 response still gets diffed against — the same mechanism
// `azureBranchSnapshot.diff` already uses, since a webhook nobody heard from
// should never be the only way a push is noticed. Process-local like its Azure
// sibling: a restart just re-establishes a baseline on its next poll rather than
// treating every branch as newly changed.
export function getGithubBranchSnapshotService() {
	const snapshots = new Map<string, { etag: string; branches: Map<string, string> }>();

	return {
		getEtag(repositoryId: string): string | null {
			return snapshots.get(repositoryId)?.etag ?? null;
		},

		// Replaces the stored snapshot with `current`/`etag` and returns every
		// branch whose commit differs from what was stored before this call — empty
		// on a repository's first poll, since there is nothing yet to differ from.
		diff(repositoryId: string, current: Map<string, string>, etag: string): { branch: string; sha: string }[] {
			const previous = snapshots.get(repositoryId);

			snapshots.set(repositoryId, { etag, branches: current });

			if (!previous) {
				return [];
			}

			const changed: { branch: string; sha: string }[] = [];

			for (const [branch, sha] of current) {
				if (previous.branches.get(branch) !== sha) {
					changed.push({ branch, sha });
				}
			}

			return changed;
		}
	};
}

export type GithubBranchSnapshotService = ReturnType<typeof getGithubBranchSnapshotService>;
