import fs from 'fs';
import os from 'os';
import path from 'path';
import { getExecService } from '../services/exec.service';

const exec = getExecService();

export async function git(cwd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
	const result = await exec.run('git', ['-C', cwd, ...args], opts);

	if (!result.ok) {
		throw new Error(`git ${args.join(' ')}: ${result.reason}`);
	}

	return result.stdout;
}

export async function identify(cwd: string): Promise<void> {
	await git(cwd, ['config', 'user.email', 'a@b.c']);
	await git(cwd, ['config', 'user.name', 'Test']);
}

// A bare remote plus a worktree checkout with `origin` already pointed at it —
// the shared starting point every push/fetch/merge scenario builds its own
// commits and clones on top of.
export async function bootstrapBareRemote(tmpPrefix: string): Promise<{ root: string; worktree: string; other: string }> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
	const worktree = path.join(root, 'worktree');
	const other = path.join(root, 'other');

	await git(root, ['init', '--bare', '-b', 'main', 'remote.git']);
	await git(root, ['init', '-b', 'main', 'worktree']);
	await identify(worktree);
	await git(worktree, ['remote', 'add', 'origin', path.join(root, 'remote.git')]);

	return { root, worktree, other };
}
