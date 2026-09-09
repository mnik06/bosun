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
		const result = await service().ensure({ slug: 'auth-work' });

		expect(result.ok).toBe(true);
		expect(result.baseRef).toBe('main');
		expect(fs.existsSync(path.join(result.worktreePath, 'README.md'))).toBe(true);
		expect(await git(result.worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe(
			'bosun/worktree/auth-work'
		);
	});

	// A queue created against an offline machine is re-sent the same ensure when it
	// reconnects, so a second one has to find the worktree rather than fail on the
	// branch already existing.
	// Git refs are paths: a branch at `bosun/auth-work` makes every
	// `bosun/auth-work/...` impossible to create, and plan branches are exactly
	// that shape. Keeping the worktree's own branch under its own segment is what
	// stops the first plan failing with `cannot lock ref`.
	it('holds its branch under a segment plan branches never use', async () => {
		const created = await service().ensure({ slug: 'shared' });
		const head = await git(created.worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);

		expect(head.startsWith('bosun/worktree/')).toBe(true);
		await expect(
			git(created.worktreePath, ['branch', 'bosun/plan/shared/1-a', 'HEAD'])
		).resolves.toBeDefined();
	});

	it('is idempotent', async () => {
		const first = await service().ensure({ slug: 'auth-work' });
		const second = await service().ensure({ slug: 'auth-work' });

		expect(second.ok).toBe(true);
		expect(second.worktreePath).toBe(first.worktreePath);
	});

	it('keeps two queues in separate checkouts', async () => {
		const one = await service().ensure({ slug: 'one' });
		const two = await service().ensure({ slug: 'two' });

		fs.writeFileSync(path.join(one.worktreePath, 'only-in-one'), 'x');

		expect(fs.existsSync(path.join(two.worktreePath, 'only-in-one'))).toBe(false);
	});

	it('removes the checkout and its registration', async () => {
		await service().ensure({ slug: 'gone' });
		await service().remove('gone');

		expect(fs.existsSync(service().pathFor('gone'))).toBe(false);
		expect(await git(repoPath, ['worktree', 'list'])).not.toContain('gone');
	});

	// Removing a queue is how somebody gets rid of it, so refusing over changes
	// they no longer want would leave a directory bosun has already forgotten.
	it('removes a checkout with uncommitted changes in it', async () => {
		const created = await service().ensure({ slug: 'dirty' });

		fs.writeFileSync(path.join(created.worktreePath, 'README.md'), 'changed\n');
		await service().remove('dirty');

		expect(fs.existsSync(created.worktreePath)).toBe(false);
	});

	// Killing a queue takes its local branches with it — the worktree branch and
	// every plan branch cut inside it — and nothing else. A branch belonging to
	// another queue, or to the person's own work, is not this operation's to take.
	it('deletes its own branches and leaves everybody else\'s alone', async () => {
		await service().ensure({ slug: 'doomed' });
		await service().ensure({ slug: 'kept' });
		await git(repoPath, ['branch', 'bosun/plan/doomed/1-thing', 'main']);
		await git(repoPath, ['branch', 'feature/mine', 'main']);

		await service().remove('doomed');

		const branches = await git(repoPath, ['branch', '--list']);

		expect(branches).not.toContain('bosun/worktree/doomed');
		expect(branches).not.toContain('bosun/plan/doomed/1-thing');
		expect(branches).toContain('bosun/worktree/kept');
		expect(branches).toContain('feature/mine');
	});

	// A directory deleted by hand leaves metadata git still believes in, and
	// `worktree add` then refuses the path.
	it('recreates a checkout whose directory was deleted behind its back', async () => {
		const created = await service().ensure({ slug: 'clobbered' });

		fs.rmSync(created.worktreePath, { recursive: true, force: true });

		expect((await service().ensure({ slug: 'clobbered' })).ok).toBe(true);
	});

	// A worktree with no .env runs nothing, and git tracks none of those files —
	// the machine's own checkout is the only place they exist. An ignored file is
	// copied; a directory ignored whole is what the setup command rebuilds, and
	// copying it would move node_modules into every queue.
	it('copies untracked and ignored files, but not an ignored directory', async () => {
		fs.writeFileSync(path.join(repoPath, '.gitignore'), '.env.local\nnode_modules/\n');
		fs.writeFileSync(path.join(repoPath, '.env'), 'SECRET=1\n');
		fs.writeFileSync(path.join(repoPath, '.env.local'), 'LOCAL=1\n');
		fs.mkdirSync(path.join(repoPath, 'node_modules', 'left-pad'), { recursive: true });
		fs.writeFileSync(path.join(repoPath, 'node_modules', 'left-pad', 'index.js'), 'module.exports=1\n');

		const created = await service().ensure({ slug: 'withenv' });

		expect(fs.readFileSync(path.join(created.worktreePath, '.env'), 'utf8')).toBe('SECRET=1\n');
		expect(fs.readFileSync(path.join(created.worktreePath, '.env.local'), 'utf8')).toBe('LOCAL=1\n');
		expect(fs.existsSync(path.join(created.worktreePath, 'node_modules'))).toBe(false);
	});

	it('reports a repo path that is not a git repository', async () => {
		const notARepo = getWorktreeService({ exec, repoPath: home, homeDir: home });
		const result = await notARepo.ensure({ slug: 'nope' });

		expect(result.ok).toBe(false);
		expect(result.detail).toContain('not a git repository');
	});
});
