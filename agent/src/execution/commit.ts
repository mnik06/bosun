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

// `main` and `origin/main` are the same branch and routinely different commits.
// The remote one is what everybody else has merged into, so it is what a new plan
// branches from.
async function resolveStartPoint(
	git: (worktreePath: string, args: string[]) => Promise<{ ok: boolean }>,
	opts: { worktreePath: string; baseRef: string }
): Promise<string> {
	if (opts.baseRef.startsWith('origin/')) {
		return opts.baseRef;
	}

	const remote = `origin/${opts.baseRef}`;

	return (await git(opts.worktreePath, ['rev-parse', '--verify', remote])).ok ? remote : opts.baseRef;
}

export function getCommitService(deps: { exec: ExecService }) {
	async function git(worktreePath: string, args: string[]) {
		return deps.exec.run('git', ['-C', worktreePath, ...args], { timeoutMs: 60_000 });
	}

	return {
		// Checked out before the plan's first slice, so a plan that fails leaves its
		// partial work on a branch of its own rather than underneath the next plan's
		// pull request.
		//
		// The fetch is what makes each plan start from what the default branch
		// actually is now, rather than from whatever this worktree last saw. A queue
		// left running for a day would otherwise cut every plan from the same stale
		// commit and rediscover the same conflicts in every pull request.
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

			const fetched = await git(opts.worktreePath, ['fetch', 'origin', '--prune']);
			// A repository with no remote is a legitimate setup — the branch is then
			// cut from whatever this clone holds, which is all there is.
			const startPoint = fetched.ok ? await resolveStartPoint(git, opts) : opts.baseRef;
			const checkout = await git(opts.worktreePath, ['checkout', '-B', opts.branch, startPoint]);

			return checkout.ok
				? { ok: true, detail: `${opts.branch} from ${startPoint}` }
				: { ok: false, detail: checkout.reason };
		},

		// Run before every bullet that is not cutting the branch. A bullet that
		// succeeded left nothing behind — bosun committed all of it — so this is a
		// no-op then. A bullet that *failed* left whatever it had written, and a
		// retry that inherits that mess commits it under the retry's name.
		//
		// `HEAD`, never the base ref: the commits the finished bullets made are on
		// this branch, and resetting past them would rebuild work the plan already
		// has.
		async cleanTree(worktreePath: string): Promise<{ ok: boolean; detail: string }> {
			const reset = await git(worktreePath, ['reset', '--hard', 'HEAD']);

			if (!reset.ok) {
				return { ok: false, detail: reset.reason };
			}

			await git(worktreePath, ['clean', '-fd']);

			return { ok: true, detail: 'worktree clean at HEAD' };
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
