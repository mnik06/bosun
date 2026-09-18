import { diffBranchHeads } from 'src/utils/general';

// The polling half of sync (AC-66, AC-67): each repository's previous set of
// branch heads, kept process-local like the rate-limit cooldown next to it — a
// restart just re-establishes a baseline on its next poll rather than firing
// push handling for every branch that looks "changed" against nothing. Losing
// the snapshot costs one silent poll, not a wrong result.
export function getAzureBranchSnapshotService() {
	const snapshots = new Map<string, Map<string, string>>();

	return {
		// Replaces the stored snapshot with `current` and returns every branch whose
		// commit differs from what was stored before this call — empty on a
		// repository's first poll, since there is nothing yet to differ from.
		diff(repositoryId: string, current: Map<string, string>): { branch: string; sha: string }[] {
			const changed = diffBranchHeads(snapshots.get(repositoryId), current);

			snapshots.set(repositoryId, current);

			return changed;
		}
	};
}

export type AzureBranchSnapshotService = ReturnType<typeof getAzureBranchSnapshotService>;
