import { type ExecService } from '../services/exec.service';

export interface CommitResult {
	ok: boolean;
	commitSha: string | null;
	detail: string;
}

// A verify slice normally changes nothing, and a build slice can legitimately
// end with the work already present. Neither is a failure, so "nothing to
// commit" returns a null sha rather than an error.
export function isNothingToCommit(output: string): boolean {
	return /nothing to commit|no changes added to commit/i.test(output);
}

export function commitMessageFor(opts: {
	planTitle: string;
	sliceOrdinal: number;
	sliceTitle: string;
}): string {
	return `${opts.planTitle} — slice ${opts.sliceOrdinal}: ${opts.sliceTitle}`;
}

export function getCommitService(deps: { exec: ExecService }) {
	async function git(worktreePath: string, args: string[]) {
		return deps.exec.run('git', ['-C', worktreePath, ...args], { timeoutMs: 60_000 });
	}

	return {
		// Checked out before the plan's first slice, so a plan that fails leaves its
		// partial work on a branch of its own rather than underneath the next plan's
		// pull request.
		async startBranch(opts: {
			worktreePath: string;
			branch: string;
			baseRef: string;
		}): Promise<{ ok: boolean; detail: string }> {
			const reset = await git(opts.worktreePath, ['reset', '--hard']);

			if (!reset.ok) {
				return { ok: false, detail: `could not reset the worktree: ${reset.reason}` };
			}

			await git(opts.worktreePath, ['clean', '-fd']);

			const checkout = await git(opts.worktreePath, ['checkout', '-B', opts.branch, opts.baseRef]);

			return checkout.ok
				? { ok: true, detail: `${opts.branch} from ${opts.baseRef}` }
				: { ok: false, detail: checkout.reason };
		},

		async commitAll(opts: { worktreePath: string; message: string }): Promise<CommitResult> {
			const added = await git(opts.worktreePath, ['add', '-A']);

			if (!added.ok) {
				return { ok: false, commitSha: null, detail: added.reason };
			}

			const committed = await git(opts.worktreePath, ['commit', '-m', opts.message]);

			if (!committed.ok) {
				return isNothingToCommit(`${committed.stdout}\n${committed.reason}`)
					? { ok: true, commitSha: null, detail: 'nothing to commit' }
					: { ok: false, commitSha: null, detail: committed.reason };
			}

			const sha = await git(opts.worktreePath, ['rev-parse', 'HEAD']);

			return { ok: true, commitSha: sha.ok ? sha.stdout : null, detail: 'committed' };
		}
	};
}

export type CommitService = ReturnType<typeof getCommitService>;
