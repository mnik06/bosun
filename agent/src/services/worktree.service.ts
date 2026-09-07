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

	function branchFor(slug: string): string {
		return `bosun/${slug}`;
	}

	async function prune(): Promise<void> {
		await deps.exec.run('git', ['-C', deps.repoPath, 'worktree', 'prune'], {});
	}

	return {
		root,
		pathFor,

		// Idempotent on purpose. A queue whose machine was offline at creation is
		// re-sent the same ensure when it reconnects, and a second create must find
		// the worktree it already made rather than fail on the branch existing.
		async ensure(slug: string): Promise<WorktreeResult> {
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

			return created.ok
				? { ok: true, worktreePath, baseRef, detail: `created from ${baseRef}` }
				: { ok: false, worktreePath, baseRef, detail: created.reason };
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
