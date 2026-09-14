import { type ExecService } from '../services/exec.service';

const NETWORK_TIMEOUT_MS = 180_000;

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

// The plan's branch on the remote is not bosun's alone. A reviewer pushes a fix
// to the pull request, "Update branch" merges the base into it, a plan queued
// again after its pull request opened cuts the same branch name — and each of
// those leaves `origin/<branch>` holding commits this worktree never saw. Work
// built without them is refused at push, after every bullet has already run.
//
// Fetched by explicit refspec: a `--single-branch` clone's default refspec
// covers only the default branch, so `origin/<branch>` would never appear.
// Null when the remote has no such branch, or cannot be reached — a clone with
// no remote is a legitimate setup, and an unreachable one fails at push with
// its own reason.
async function fetchRemoteBranch(opts: {
	exec: ExecService;
	worktreePath: string;
	branch: string;
}): Promise<string | null> {
	const run = (args: string[]) =>
		opts.exec.run('git', ['-C', opts.worktreePath, ...args], { timeoutMs: NETWORK_TIMEOUT_MS });
	const listed = await run(['ls-remote', '--heads', 'origin', `refs/heads/${opts.branch}`]);

	if (!listed.ok || listed.stdout === '') {
		return null;
	}

	const remote = `origin/${opts.branch}`;
	const fetched = await run(['fetch', 'origin', `+refs/heads/${opts.branch}:refs/remotes/${remote}`]);

	return fetched.ok ? remote : null;
}

// Merged rather than rebased: each finished bullet's sha is recorded against its
// slice, and a rebase would leave those pointing at commits no branch contains.
export async function syncWithRemote(opts: {
	exec: ExecService;
	worktreePath: string;
	branch: string;
}): Promise<{ ok: boolean; detail: string }> {
	const git = (args: string[]) =>
		opts.exec.run('git', ['-C', opts.worktreePath, ...args], { timeoutMs: 60_000 });
	const remote = await fetchRemoteBranch(opts);

	if (remote === null) {
		return { ok: true, detail: 'nothing on the remote to bring in' };
	}

	if ((await git(['merge-base', '--is-ancestor', remote, 'HEAD'])).ok) {
		return { ok: true, detail: `already contains ${remote}` };
	}

	const merged = await git(['merge', '--no-edit', remote]);

	if (merged.ok) {
		return { ok: true, detail: `merged ${remote}` };
	}

	// A half-applied merge left in place would be committed by the next bullet
	// under its own name, conflict markers and all.
	await git(['merge', '--abort']);

	return {
		ok: false,
		detail: `${remote} has commits that conflict with this branch: ${merged.stdout || merged.reason}`
	};
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
		//
		// A branch the remote already has is continued rather than cut again. Cut
		// from the base, it would share no history with the pushed one, and the
		// push at the end of the plan would be refused.
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
			const pushed = fetched.ok
				? await fetchRemoteBranch({ exec: deps.exec, worktreePath: opts.worktreePath, branch: opts.branch })
				: null;
			// A repository with no remote is a legitimate setup — the branch is then
			// cut from whatever this clone holds, which is all there is.
			const startPoint = pushed ?? (fetched.ok ? await resolveStartPoint(git, opts) : opts.baseRef);
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
		async cleanTree(opts: {
			worktreePath: string;
			branch: string;
		}): Promise<{ ok: boolean; detail: string }> {
			const reset = await git(opts.worktreePath, ['reset', '--hard', 'HEAD']);

			if (!reset.ok) {
				return { ok: false, detail: reset.reason };
			}

			await git(opts.worktreePath, ['clean', '-fd']);

			// Named rather than assumed. A bullet that is not cutting the branch used
			// to run on whatever the worktree was already on, which holds while a plan
			// runs start to finish — and stops holding the moment one bullet of an
			// older plan is run again, because the queue has moved the worktree to a
			// later plan's branch since. That bullet would then commit onto the wrong
			// branch, and the pull request it belongs to would never see the work.
			const head = await git(opts.worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);

			if (!head.ok || head.stdout.trim() !== opts.branch) {
				const checkout = await git(opts.worktreePath, ['checkout', opts.branch]);

				if (!checkout.ok) {
					return { ok: false, detail: `could not check out ${opts.branch}: ${checkout.reason}` };
				}
			}

			// Before the bullet rather than only at push: a bullet built on top of what
			// the remote gained resolves any conflict with it as part of its own work,
			// where one found at push has nobody left to resolve it.
			const synced = await syncWithRemote({
				exec: deps.exec,
				worktreePath: opts.worktreePath,
				branch: opts.branch
			});

			return synced.ok
				? { ok: true, detail: `${opts.branch} clean at HEAD, ${synced.detail}` }
				: synced;
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
