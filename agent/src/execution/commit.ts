import { type ExecService } from '../services/exec.service';

const NETWORK_TIMEOUT_MS = 180_000;

// A credential helper that answers nothing leaves git to ask a terminal. The agent
// has none to answer from, so the prompt would sit until the timeout and report a
// hang instead of git's own "could not read Username".
export function networkGitEnv(): NodeJS.ProcessEnv {
	return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
}

export interface CommitResult {
	ok: boolean;
	commitSha: string | null;
	detail: string;
}

// A verify slice normally changes nothing, and a build slice can legitimately
// end with the work already present. Neither is a failure, so "nothing to
// commit" returns a null sha rather than an error. "Nothing added to commit" is
// git's wording when all that is left is untracked — an env file kept out of it.
export function isNothingToCommit(output: string): boolean {
	return /nothing (?:added )?to commit|no changes added to commit/i.test(output);
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
		opts.exec.run('git', ['-C', opts.worktreePath, ...args], { env: networkGitEnv(), timeoutMs: NETWORK_TIMEOUT_MS });
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

const SHA = /^[0-9a-f]{7,40}$/i;

async function haveCommit(opts: { exec: ExecService; worktreePath: string; sha: string }): Promise<boolean> {
	const found = await opts.exec.run('git', ['-C', opts.worktreePath, 'rev-parse', '-q', '--verify', `${opts.sha}^{commit}`], {
		timeoutMs: 30_000
	});

	return found.ok;
}

// A provider's commit reaches this clone by whichever route the remote allows:
// asked for by sha, and failing that by fetching every plan branch it could sit on.
async function resolveStartFrom(opts: {
	exec: ExecService;
	worktreePath: string;
	startFrom: string;
}): Promise<string | null> {
	if (!SHA.test(opts.startFrom)) {
		return fetchRemoteBranch({ exec: opts.exec, worktreePath: opts.worktreePath, branch: opts.startFrom.replace(/^origin\//, '') });
	}

	const fetch = async (args: string[]) =>
		opts.exec.run('git', ['-C', opts.worktreePath, 'fetch', 'origin', ...args], {
			env: networkGitEnv(),
			timeoutMs: NETWORK_TIMEOUT_MS
		});

	for (const attempt of [[] as string[], [opts.startFrom], ['+refs/heads/bosun/plan/*:refs/remotes/origin/bosun/plan/*']]) {
		if (attempt.length > 0) {
			await fetch(attempt);
		}

		if (await haveCommit({ ...opts, sha: opts.startFrom })) {
			return opts.startFrom;
		}
	}

	return null;
}

// A stacked plan is built on its providers' branches, merged rather than rebased
// for the reason `syncWithRemote` gives. One already contained is skipped, so this
// runs before every bullet at the cost of a fetch per provider. A merge that fails
// names the branch in `conflictWith`, so the backend can integrate onto it.
export async function mergeBranches(opts: {
	exec: ExecService;
	worktreePath: string;
	branches: string[];
}): Promise<{ ok: boolean; detail: string; conflictWith?: string }> {
	const git = (args: string[]) =>
		opts.exec.run('git', ['-C', opts.worktreePath, ...args], { timeoutMs: 60_000 });
	const merged: string[] = [];

	for (const branch of opts.branches) {
		const remote = await fetchRemoteBranch({ exec: opts.exec, worktreePath: opts.worktreePath, branch });

		if (remote === null) {
			return { ok: false, detail: `${branch} is not on the remote, so there is nothing of it to build on` };
		}

		if ((await git(['merge-base', '--is-ancestor', remote, 'HEAD'])).ok) {
			continue;
		}

		const result = await git(['merge', '--no-edit', remote]);

		if (!result.ok) {
			await git(['merge', '--abort']);

			return {
				ok: false,
				detail: `merging ${remote} conflicts with this branch: ${result.stdout || result.reason}`,
				conflictWith: branch
			};
		}

		merged.push(remote);
	}

	return { ok: true, detail: merged.length === 0 ? 'providers already contained' : `merged ${merged.join(', ')}` };
}

export function getCommitService(deps: { exec: ExecService }) {
	async function git(worktreePath: string, args: string[]) {
		return deps.exec.run('git', ['-C', worktreePath, ...args], { timeoutMs: 60_000 });
	}

	// A repository with no remote is a legitimate setup — the branch is then cut
	// from whatever this clone holds, which is all there is.
	async function startPointFor(opts: {
		worktreePath: string;
		branch: string;
		baseRef: string;
		startFrom: string | null;
		fetched: boolean;
	}): Promise<{ ref: string } | { failure: string }> {
		const pushed = opts.fetched
			? await fetchRemoteBranch({ exec: deps.exec, worktreePath: opts.worktreePath, branch: opts.branch })
			: null;

		if (pushed !== null) {
			return { ref: pushed };
		}

		if (opts.startFrom !== null) {
			const provider = await resolveStartFrom({ exec: deps.exec, worktreePath: opts.worktreePath, startFrom: opts.startFrom });

			return provider === null
				? { failure: `could not find ${opts.startFrom} to start this plan from — its provider has not pushed it` }
				: { ref: provider };
		}

		return { ref: opts.fetched ? await resolveStartPoint(git, opts) : opts.baseRef };
	}

	return {
		// A build's branch, decided when it takes its first slot. A branch the remote
		// already has is continued rather than cut again — cut from the base, it would
		// share no history with the pushed one and the next push would be refused —
		// and one this worktree already holds is kept when the build is resuming, so
		// commits a failed push left only here are not thrown away.
		//
		// Otherwise it starts from the provider's commit the dependency was satisfied
		// by, or from what the default branch is now; and every provider branch named
		// in `mergeIn` is merged on top. A dependent is never cut from a base that
		// does not contain the work it waits on.
		async startBuildBranch(opts: {
			worktreePath: string;
			branch: string;
			baseRef: string;
			fresh: boolean;
			startFrom: string | null;
			mergeIn: string[];
		}): Promise<{ ok: boolean; detail: string }> {
			const reset = await git(opts.worktreePath, ['reset', '--hard']);

			if (!reset.ok) {
				return { ok: false, detail: `could not reset the worktree: ${reset.reason}` };
			}

			await git(opts.worktreePath, ['clean', '-fd']);

			const fetched = await git(opts.worktreePath, ['fetch', 'origin', '--prune']);
			const local = (await git(opts.worktreePath, ['rev-parse', '-q', '--verify', `refs/heads/${opts.branch}`])).ok;
			let detail: string;

			if (!opts.fresh && local) {
				const checkout = await git(opts.worktreePath, ['checkout', opts.branch]);

				if (!checkout.ok) {
					return { ok: false, detail: `could not check out ${opts.branch}: ${checkout.reason}` };
				}

				const synced = await syncWithRemote({ exec: deps.exec, worktreePath: opts.worktreePath, branch: opts.branch });

				if (!synced.ok) {
					return synced;
				}

				detail = `${opts.branch} resumed, ${synced.detail}`;
			} else {
				const start = await startPointFor({ ...opts, fetched: fetched.ok });

				if ('failure' in start) {
					return { ok: false, detail: start.failure };
				}

				const checkout = await git(opts.worktreePath, ['checkout', '-B', opts.branch, start.ref]);

				if (!checkout.ok) {
					return { ok: false, detail: checkout.reason };
				}

				detail = `${opts.branch} from ${start.ref}`;
			}

			const merged = await mergeBranches({ exec: deps.exec, worktreePath: opts.worktreePath, branches: opts.mergeIn });

			return merged.ok ? { ok: true, detail: `${detail}, ${merged.detail}` } : merged;
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

			// Named rather than assumed. A worktree belongs to one build, but a bullet
			// running on whatever happens to be checked out commits onto the wrong
			// branch the day anything else moves it — an integration abandoned mid-way,
			// a person poking at the checkout — and its pull request never sees the work.
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

		// `keepOut` is what bosun itself wrote into the worktree: the operator's `.env`
		// files. Unstaged after `add -A` rather than trusted to `.gitignore`, because a
		// repository that does not ignore `.env` would otherwise commit the values and
		// push them with the pull request. The files stay in the tree, uncommitted.
		async commitAll(opts: {
			worktreePath: string;
			message: string;
			keepOut?: string[];
		}): Promise<CommitResult> {
			const added = await git(opts.worktreePath, ['add', '-A']);

			if (!added.ok) {
				return { ok: false, commitSha: null, detail: added.reason };
			}

			if (opts.keepOut !== undefined && opts.keepOut.length > 0) {
				const unstaged = await git(opts.worktreePath, ['reset', '-q', '--', ...opts.keepOut]);

				if (!unstaged.ok) {
					return {
						ok: false,
						commitSha: null,
						detail: `could not keep the provided env files out of the commit: ${unstaged.reason}`
					};
				}
			}

			const committed = await git(opts.worktreePath, ['commit', '-m', opts.message]);

			if (!committed.ok) {
				return isNothingToCommit(`${committed.stdout}\n${committed.reason}`)
					? { ok: true, commitSha: null, detail: 'nothing to commit' }
					: { ok: false, commitSha: null, detail: committed.reason };
			}

			const sha = await git(opts.worktreePath, ['rev-parse', 'HEAD']);

			return { ok: true, commitSha: sha.ok ? sha.stdout : null, detail: 'committed' };
		},

		// Pushed after every bullet, not only at the end: a provider's foundation on
		// the remote is what lets a dependent start, on this machine or another.
		async pushBranch(opts: { worktreePath: string; branch: string }): Promise<{ ok: boolean; detail: string }> {
			const synced = await syncWithRemote({ exec: deps.exec, worktreePath: opts.worktreePath, branch: opts.branch });

			if (!synced.ok) {
				return { ok: false, detail: `could not push ${opts.branch}: ${synced.detail}` };
			}

			const pushed = await deps.exec.run(
				'git',
				['-C', opts.worktreePath, 'push', '-u', 'origin', `HEAD:refs/heads/${opts.branch}`],
				{ env: networkGitEnv(), timeoutMs: NETWORK_TIMEOUT_MS }
			);

			return pushed.ok ? { ok: true, detail: 'pushed' } : { ok: false, detail: `could not push ${opts.branch}: ${pushed.reason}` };
		},

		async changedFiles(opts: { worktreePath: string; sha: string }): Promise<string[]> {
			const shown = await git(opts.worktreePath, ['show', '--name-only', '--format=', opts.sha]);

			return shown.ok ? shown.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : [];
		},

		// A drive commits nothing, and whatever it left behind — a file a browser tool
		// wrote, a log — must not be committed by the fix session that follows it.
		async discardChanges(worktreePath: string): Promise<void> {
			await git(worktreePath, ['reset', '--hard', 'HEAD']);
			await git(worktreePath, ['clean', '-fd']);
		}
	};
}
