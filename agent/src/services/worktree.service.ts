import fs from 'fs';
import os from 'os';
import path from 'path';
import { type ExecService } from './exec.service';

export const WORKTREE_DIRNAME = 'worktrees';

export interface WorktreeResult {
	ok: boolean;
	worktreePath: string;
	baseRef: string;
	detail: string;
}

// The branch a worktree is cut from, and the one every plan's branch will later
// be cut from too. `origin/HEAD` is preferred over the checkout's current branch
// because the repository the operator happens to have checked out is not
// necessarily the line of development they want work based on.
// Everything git does not track is what a fresh worktree lacks: `.env` and its
// neighbours. A directory that is ignored whole — node_modules, dist, .venv —
// comes back from `--directory` as a single `name/` entry and is skipped: that
// is what the setup command exists to rebuild, and copying it would move
// gigabytes into every queue.
async function untrackedPaths(opts: { exec: ExecService; repoPath: string }): Promise<string[]> {
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
		...new Set([
			...entries(plain),
			...entries(ignored).filter((entry) => !entry.endsWith('/'))
		])
	];
}

function copyUntracked(opts: { from: string; to: string; files: string[] }): string[] {
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

async function resolveBaseRef(opts: { exec: ExecService; repoPath: string }): Promise<string | null> {
	const remote = await opts.exec.run(
		'git',
		['-C', opts.repoPath, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
		{}
	);

	if (remote.ok && remote.stdout) {
		return remote.stdout;
	}

	const head = await opts.exec.run('git', ['-C', opts.repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'], {});

	return head.ok && head.stdout ? head.stdout : null;
}

export function getWorktreeService(deps: {
	exec: ExecService;
	repoPath: string;
	homeDir?: string;
}) {
	const root = path.join(deps.homeDir ?? os.homedir(), '.bosun', WORKTREE_DIRNAME);

	function pathFor(slug: string): string {
		return path.join(root, slug);
	}

	// Under its own segment, never `bosun/<slug>` directly. Git refs are paths, so
	// a branch at `bosun/auth` makes every `bosun/auth/...` impossible to create —
	// and plan branches live under exactly that shape.
	function branchFor(slug: string): string {
		return `bosun/worktree/${slug}`;
	}

	async function prune(): Promise<void> {
		await deps.exec.run('git', ['-C', deps.repoPath, 'worktree', 'prune'], {});
	}

	return {
		root,
		pathFor,

		// Run once per worktree, after it exists and its untracked files are in
		// place. A fresh checkout has no node_modules, so the first bullet would
		// otherwise spend its session discovering that.
		async setup(opts: { slug: string; command: string }): Promise<{ ok: boolean; detail: string }> {
			const result = await deps.exec.run('sh', ['-lc', opts.command], {
				cwd: pathFor(opts.slug),
				timeoutMs: 900_000
			});

			return { ok: result.ok, detail: result.ok ? 'setup done' : result.reason };
		},

		// Idempotent on purpose. A queue whose machine was offline at creation is
		// re-sent the same ensure when it reconnects, and a second create must find
		// the worktree it already made rather than fail on the branch existing.
		async ensure(opts: { slug: string }): Promise<WorktreeResult> {
			const slug = opts.slug;
			const worktreePath = pathFor(slug);
			const baseRef = await resolveBaseRef({ exec: deps.exec, repoPath: deps.repoPath });

			if (baseRef === null) {
				return {
					ok: false,
					worktreePath,
					baseRef: '',
					detail: `${deps.repoPath} is not a git repository, or has no branch to work from`
				};
			}

			if (fs.existsSync(path.join(worktreePath, '.git'))) {
				return { ok: true, worktreePath, baseRef, detail: 'already present' };
			}

			fs.mkdirSync(root, { recursive: true, mode: 0o700 });
			// Stale metadata from a directory removed by hand makes `worktree add`
			// refuse a path git still believes it owns.
			await prune();

			const branch = branchFor(slug);
			const created = await deps.exec.run(
				'git',
				['-C', deps.repoPath, 'worktree', 'add', '-B', branch, worktreePath, baseRef],
				{ timeoutMs: 120_000 }
			);

			if (!created.ok) {
				return { ok: false, worktreePath, baseRef, detail: created.reason };
			}

			// They exist only in the machine's own checkout, which is why bosun copies
			// them rather than the session recreating from nothing what it cannot see.
			const copied = copyUntracked({
				from: deps.repoPath,
				to: worktreePath,
				files: await untrackedPaths({ exec: deps.exec, repoPath: deps.repoPath })
			});

			return {
				ok: true,
				worktreePath,
				baseRef,
				detail: `created from ${baseRef}${copied.length === 0 ? '' : `, copied ${copied.length} untracked file${copied.length === 1 ? '' : 's'}`}`
			};
		},

		// `--force` because a queue is deleted to get rid of it: refusing over
		// uncommitted changes would leave a directory bosun has already forgotten,
		// with no way left in the browser to ask again.
		async remove(slug: string): Promise<void> {
			const worktreePath = pathFor(slug);

			await deps.exec.run(
				'git',
				['-C', deps.repoPath, 'worktree', 'remove', '--force', worktreePath],
				{ timeoutMs: 60_000 }
			);
			fs.rmSync(worktreePath, { recursive: true, force: true });
			await prune();
		}
	};
}

export type WorktreeService = ReturnType<typeof getWorktreeService>;
