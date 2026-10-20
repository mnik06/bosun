import fs from 'fs';
import path from 'path';
import { type ExecService } from '../services/exec.service';

function realPath(target: string): string {
	try {
		return fs.realpathSync(target);
	} catch {
		return path.resolve(target);
	}
}

function holderOf(opts: { porcelain: string; branch: string }): string | null {
	for (const block of opts.porcelain.split(/\n\s*\n/)) {
		const lines = block.split('\n');
		const worktree = lines.find((line) => line.startsWith('worktree '));

		if (worktree && lines.includes(`branch refs/heads/${opts.branch}`)) {
			return worktree.slice('worktree '.length);
		}
	}

	return null;
}

// A cancelled build whose removal never reached the machine keeps its worktree,
// and git lets only one worktree hold a branch — so the plan, approved again,
// could not start. Bosun keeps one live build a plan, so a sibling worktree
// holding the branch belongs to a build that is over. It is removed only when
// every commit it made is on origin: uncommitted work is not kept on a resume
// either (the tree is reset), but a commit a failed push left there is the only
// copy. A holder outside bosun's worktrees is somebody's checkout, never touched.
export async function releaseStaleHolder(opts: {
	exec: ExecService;
	worktreePath: string;
	branch: string;
}): Promise<{ ok: boolean; detail: string }> {
	const git = (cwd: string, args: string[]) => opts.exec.run('git', ['-C', cwd, ...args], { timeoutMs: 60_000 });
	const listed = await git(opts.worktreePath, ['worktree', 'list', '--porcelain']);
	const holder = listed.ok ? holderOf({ porcelain: listed.stdout, branch: opts.branch }) : null;

	if (holder === null || realPath(holder) === realPath(opts.worktreePath)) {
		return { ok: true, detail: '' };
	}

	if (realPath(path.dirname(holder)) !== realPath(path.dirname(opts.worktreePath))) {
		return { ok: false, detail: `${opts.branch} is checked out at ${holder}, outside bosun's worktrees — switch it away there, then retry` };
	}

	const unpushed = await git(holder, ['rev-list', '--count', `origin/${opts.branch}..HEAD`]);

	if (!unpushed.ok || unpushed.stdout.trim() !== '0') {
		return {
			ok: false,
			detail: `${opts.branch} is held by an earlier build's worktree at ${holder}, which has commits origin does not — push them from there, or remove that worktree, then retry`
		};
	}

	const removed = await git(opts.worktreePath, ['worktree', 'remove', '--force', holder]);

	if (!removed.ok) {
		return { ok: false, detail: `could not remove the earlier build's worktree at ${holder}: ${removed.reason}` };
	}

	await git(opts.worktreePath, ['worktree', 'prune']);

	return { ok: true, detail: `released from ${holder}` };
}
