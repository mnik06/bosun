import fs from 'fs';
import os from 'os';
import path from 'path';
import { type ExecService } from './exec.service';

export const READ_TREE_DIRNAME = 'read-tree';

const FETCH_TIMEOUT_MS = 180_000;

export interface ReadTree {
	path: string;
	ref: string;
	sha: string | null;
	// False when the machine's own checkout is being read instead, because the
	// fresh one could not be produced. The session is told, rather than left to
	// reason from a tree of unknown age as though it were current.
	fresh: boolean;
	detail: string;
}

// The branch every worktree is cut from, and every plan branch after it.
// `origin/HEAD` is preferred over whatever the operator has checked out: the
// branch they happen to be on is not necessarily the line of development the
// work is meant to be based on.
export async function resolveBaseRef(opts: {
	exec: ExecService;
	repoPath: string;
}): Promise<string | null> {
	const remote = await opts.exec.run(
		'git',
		['-C', opts.repoPath, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
		{}
	);

	if (remote.ok && remote.stdout) {
		return remote.stdout;
	}

	const head = await opts.exec.run(
		'git',
		['-C', opts.repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
		{}
	);

	return head.ok && head.stdout ? head.stdout : null;
}

// Everything git does not track is what a fresh worktree lacks: `.env` and its
// neighbours. A directory that is ignored whole — node_modules, dist, .venv —
// comes back from `--directory` as a single `name/` entry and is skipped: that
// is what the setup command exists to rebuild, and copying it would move
// gigabytes into every queue.
export async function untrackedPaths(opts: {
	exec: ExecService;
	repoPath: string;
}): Promise<string[]> {
	const base = ['-C', opts.repoPath, 'ls-files', '-z', '--others'];
	const [plain, ignored] = await Promise.all([
		opts.exec.run('git', [...base, '--exclude-standard'], { timeoutMs: 60_000 }),
		opts.exec.run('git', [...base, '--ignored', '--exclude-standard', '--directory'], {
			timeoutMs: 60_000
		})
	]);

	const entries = (result: { ok: boolean; stdout: string }): string[] =>
		result.ok ? result.stdout.split('\0').filter((entry) => entry !== '') : [];

	return [
		...new Set([...entries(plain), ...entries(ignored).filter((entry) => !entry.endsWith('/'))])
	];
}

export function copyUntracked(opts: { from: string; to: string; files: string[] }): string[] {
	const copied: string[] = [];

	for (const file of opts.files) {
		const source = path.join(opts.from, file);
		const target = path.join(opts.to, file);

		if (!fs.existsSync(source)) {
			continue;
		}

		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(source, target);
		copied.push(file);
	}

	return copied;
}

export function getRepoService(deps: { exec: ExecService; repoPath: string; homeDir?: string }) {
	const treePath = path.join(deps.homeDir ?? os.homedir(), '.bosun', READ_TREE_DIRNAME);

	async function git(args: string[], opts?: { cwd?: string; timeoutMs?: number }) {
		return deps.exec.run('git', ['-C', opts?.cwd ?? deps.repoPath, ...args], {
			timeoutMs: opts?.timeoutMs
		});
	}

	// Every session that reads the repository runs this first. Without it the
	// machine's remote refs are whatever the last fetch left, so a plan is written
	// against a default branch that may be days old — and the session concludes a
	// table is missing when it landed on Tuesday.
	async function fetch(): Promise<{ ok: boolean; detail: string }> {
		const remotes = await git(['remote']);

		// A clone with no remote is a legitimate setup: there is nothing to be
		// behind, and what this checkout holds is all there is.
		if (!remotes.ok || remotes.stdout === '') {
			return { ok: true, detail: 'no remote to fetch from' };
		}

		const fetched = await git(['fetch', '--all', '--prune', '--tags'], {
			timeoutMs: FETCH_TIMEOUT_MS
		});

		if (!fetched.ok) {
			return { ok: false, detail: fetched.reason };
		}

		// A clone made with `--single-branch`, or one whose remote HEAD was never
		// recorded, has no `origin/HEAD` — and then the base ref silently falls back
		// to whatever branch the operator has checked out. Asking the remote what
		// its default branch is costs one call and removes that whole class of
		// "planned against the wrong branch".
		const head = await git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);

		if (!head.ok) {
			await git(['remote', 'set-head', 'origin', '--auto'], { timeoutMs: 60_000 });
		}

		return { ok: true, detail: 'fetched' };
	}

	async function headSha(cwd: string): Promise<string | null> {
		const sha = await git(['rev-parse', 'HEAD'], { cwd });

		return sha.ok && sha.stdout ? sha.stdout : null;
	}

	function fallback(detail: string): ReadTree {
		return { path: deps.repoPath, ref: 'the machine checkout', sha: null, fresh: false, detail };
	}

	return {
		treePath,
		fetch,
		async baseRef(): Promise<string | null> {
			return resolveBaseRef({ exec: deps.exec, repoPath: deps.repoPath });
		},

		// A checkout of the current default branch that nothing else writes to.
		//
		// It is not the machine's own checkout, and deliberately so: that one is the
		// operator's, it can be dirty, mid-rebase or parked on an unrelated branch,
		// and moving it under them to get a clean read is not a trade this is allowed
		// to make. Reading a stale tree instead is what produced plans that rebuilt
		// things the repository already had.
		//
		// Detached rather than on a branch, so it claims no name under `bosun/` that
		// a queue slug could collide with, and there is no branch to leave behind.
		async readTree(): Promise<ReadTree> {
			const fetched = await fetch();
			const ref = await resolveBaseRef({ exec: deps.exec, repoPath: deps.repoPath });

			if (ref === null) {
				return fallback(`${deps.repoPath} is not a git repository, or has no branch to read`);
			}

			const target = await git(['rev-parse', ref]);

			if (!target.ok) {
				return fallback(`could not resolve ${ref}: ${target.reason}`);
			}

			if (!fs.existsSync(path.join(treePath, '.git'))) {
				fs.mkdirSync(path.dirname(treePath), { recursive: true, mode: 0o700 });
				// Stale metadata from a directory removed by hand makes `worktree add`
				// refuse a path git still believes it owns.
				await git(['worktree', 'prune']);

				const created = await git(['worktree', 'add', '--detach', treePath, ref], {
					timeoutMs: 120_000
				});

				if (!created.ok) {
					return fallback(`could not create a read tree: ${created.reason}`);
				}
			} else if ((await headSha(treePath)) !== target.stdout) {
				// Skipped when it is already there, so two sessions reading the same
				// commit never move the tree under each other.
				const moved = await git(['checkout', '--detach', '--force', target.stdout], {
					cwd: treePath,
					timeoutMs: 120_000
				});

				if (!moved.ok) {
					return fallback(`could not move the read tree to ${ref}: ${moved.reason}`);
				}
			}

			// `.env` and its neighbours exist only in the machine's own checkout. A
			// session reading the repository to learn its conventions cannot find them
			// anywhere else.
			copyUntracked({
				from: deps.repoPath,
				to: treePath,
				files: await untrackedPaths({ exec: deps.exec, repoPath: deps.repoPath })
			});

			return {
				path: treePath,
				ref,
				sha: target.stdout,
				fresh: true,
				detail: fetched.ok ? `${ref} at ${target.stdout.slice(0, 8)}` : `${ref}, ${fetched.detail}`
			};
		}
	};
}

export type RepoService = ReturnType<typeof getRepoService>;
