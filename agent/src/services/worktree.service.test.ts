import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from './exec.service';
import { getWorktreeService } from './worktree.service';

const exec = getExecService();

async function git(cwd: string, args: string[]) {
	const result = await exec.run('git', ['-C', cwd, ...args], {});

	if (!result.ok) {
		throw new Error(`git ${args.join(' ')}: ${result.reason}`);
	}

	return result.stdout;
}

describe('worktree service', () => {
	let home: string;
	let repoPath: string;

	beforeEach(async () => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-wt-'));
		repoPath = path.join(home, 'repo');
		fs.mkdirSync(repoPath);
		await git(repoPath, ['init', '-b', 'main']);
		await git(repoPath, ['config', 'user.email', 'a@b.c']);
		await git(repoPath, ['config', 'user.name', 'Test']);
		fs.writeFileSync(path.join(repoPath, 'README.md'), 'hello\n');
		await git(repoPath, ['add', '-A']);
		await git(repoPath, ['commit', '-m', 'first']);
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service() {
		return getWorktreeService({ exec, repoPath, homeDir: home });
	}

	it('creates a checkout of its own on a branch named for the queue', async () => {
		const result = await service().ensure('auth-work');

		expect(result.ok).toBe(true);
		expect(result.baseRef).toBe('main');
		expect(fs.existsSync(path.join(result.worktreePath, 'README.md'))).toBe(true);
		expect(await git(result.worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe(
			'bosun/auth-work'
		);
	});

	// A queue created against an offline machine is re-sent the same ensure when it
	// reconnects, so a second one has to find the worktree rather than fail on the
	// branch already existing.
	it('is idempotent', async () => {
		const first = await service().ensure('auth-work');
		const second = await service().ensure('auth-work');

		expect(second.ok).toBe(true);
		expect(second.worktreePath).toBe(first.worktreePath);
	});

	it('keeps two queues in separate checkouts', async () => {
		const one = await service().ensure('one');
		const two = await service().ensure('two');

		fs.writeFileSync(path.join(one.worktreePath, 'only-in-one'), 'x');

		expect(fs.existsSync(path.join(two.worktreePath, 'only-in-one'))).toBe(false);
	});

	it('removes the checkout and its registration', async () => {
		await service().ensure('gone');
		await service().remove('gone');

		expect(fs.existsSync(service().pathFor('gone'))).toBe(false);
		expect(await git(repoPath, ['worktree', 'list'])).not.toContain('gone');
	});

	// Removing a queue is how somebody gets rid of it, so refusing over changes
	// they no longer want would leave a directory bosun has already forgotten.
	it('removes a checkout with uncommitted changes in it', async () => {
		const created = await service().ensure('dirty');

		fs.writeFileSync(path.join(created.worktreePath, 'README.md'), 'changed\n');
		await service().remove('dirty');

		expect(fs.existsSync(created.worktreePath)).toBe(false);
	});

	// A directory deleted by hand leaves metadata git still believes in, and
	// `worktree add` then refuses the path.
	it('recreates a checkout whose directory was deleted behind its back', async () => {
		const created = await service().ensure('clobbered');

		fs.rmSync(created.worktreePath, { recursive: true, force: true });

		expect((await service().ensure('clobbered')).ok).toBe(true);
	});

	it('reports a repo path that is not a git repository', async () => {
		const notARepo = getWorktreeService({ exec, repoPath: home, homeDir: home });
		const result = await notARepo.ensure('nope');

		expect(result.ok).toBe(false);
		expect(result.detail).toContain('not a git repository');
	});
});
