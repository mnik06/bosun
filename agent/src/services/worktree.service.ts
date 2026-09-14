import fs from 'fs';
import os from 'os';
import path from 'path';
import { type ExecService } from './exec.service';
import {
	copyUntracked,
	NO_REPOSITORY,
	repoPathGetter,
	resolveBaseRef,
	untrackedPaths,
	type RepoPathSource,
	type RepoService
} from './repo.service';

export const WORKTREE_DIRNAME = 'worktrees';

export interface WorktreeResult {
	ok: boolean;
	worktreePath: string;
	baseRef: string;
	detail: string;
}

async function deleteBranches(opts: {
	exec: ExecService;
	repoPath: string;
	slug: string;
}): Promise<void> {
	const listed = await opts.exec.run(
		'git',
		[
			'-C',
			opts.repoPath,
			'for-each-ref',
			'--format=%(refname:short)',
			`refs/heads/bosun/worktree/${opts.slug}`,
			`refs/heads/bosun/plan/${opts.slug}`
		],
		{ timeoutMs: 30_000 }
	);
	const branches = listed.ok ? listed.stdout.split('\n').filter((line) => line !== '') : [];

	if (branches.length === 0) {
		return;
	}

	await opts.exec.run('git', ['-C', opts.repoPath, 'branch', '-D', ...branches], {
		timeoutMs: 60_000
	});
}

export function getWorktreeService(deps: {
	exec: ExecService;
	repo: RepoService;
	repoPath: RepoPathSource;
	homeDir?: string;
}) {
	const root = path.join(deps.homeDir ?? os.homedir(), '.bosun', WORKTREE_DIRNAME);
	const currentRepoPath = repoPathGetter(deps.repoPath);

	function pathFor(slug: string): string {
		return path.join(root, slug);
	}

	// Under its own segment, never `bosun/<slug>` directly. Git refs are paths, so
	// a branch at `bosun/auth` makes every `bosun/auth/...` impossible to create —
	// and plan branches live under exactly that shape.
	function branchFor(slug: string): string {
		return `bosun/worktree/${slug}`;
	}

	async function prune(repoPath: string): Promise<void> {
		await deps.exec.run('git', ['-C', repoPath, 'worktree', 'prune'], {});
	}

	return {
		root,
		pathFor,

		// Idempotent on purpose. A queue whose machine was offline at creation is
		// re-sent the same ensure when it reconnects, and a second create must find
		// the worktree it already made rather than fail on the branch existing.
		async ensure(opts: { slug: string }): Promise<WorktreeResult> {
			const slug = opts.slug;
			const worktreePath = pathFor(slug);
			const repoPath = currentRepoPath();

			if (repoPath === null) {
				return { ok: false, worktreePath, baseRef: '', detail: NO_REPOSITORY };
			}

			// Before the base ref is resolved, not after: `origin/HEAD` is only as
			// current as the last fetch, and a worktree cut from a stale one starts
			// every queue — and the setup command it runs — on code that has moved.
			await deps.repo.fetch();

			const baseRef = await resolveBaseRef({ exec: deps.exec, repoPath: repoPath });

			if (baseRef === null) {
				return {
					ok: false,
					worktreePath,
					baseRef: '',
					detail: `${repoPath} is not a git repository, or has no branch to work from`
				};
			}

			if (fs.existsSync(path.join(worktreePath, '.git'))) {
				return { ok: true, worktreePath, baseRef, detail: 'already present' };
			}

			fs.mkdirSync(root, { recursive: true, mode: 0o700 });
			// Stale metadata from a directory removed by hand makes `worktree add`
			// refuse a path git still believes it owns.
			await prune(repoPath);

			const branch = branchFor(slug);
			const created = await deps.exec.run(
				'git',
				['-C', repoPath, 'worktree', 'add', '-B', branch, worktreePath, baseRef],
				{ timeoutMs: 120_000 }
			);

			if (!created.ok) {
				return { ok: false, worktreePath, baseRef, detail: created.reason };
			}

			// They exist only in the machine's own checkout, which is why bosun copies
			// them rather than the session recreating from nothing what it cannot see.
			const copied = copyUntracked({
				from: repoPath,
				to: worktreePath,
				files: await untrackedPaths({ exec: deps.exec, repoPath: repoPath })
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
			const repoPath = currentRepoPath();

			if (repoPath === null) {
				fs.rmSync(worktreePath, { recursive: true, force: true });

				return;
			}


			await deps.exec.run(
				'git',
				['-C', repoPath, 'worktree', 'remove', '--force', worktreePath],
				{ timeoutMs: 60_000 }
			);
			fs.rmSync(worktreePath, { recursive: true, force: true });
			await prune(repoPath);
			await deleteBranches({ exec: deps.exec, repoPath: repoPath, slug });
		}
	};
}

export type WorktreeService = ReturnType<typeof getWorktreeService>;
