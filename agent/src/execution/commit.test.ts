import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from '../services/exec.service';
import { commitMessageFor, getCommitService, isNothingToCommit } from './commit';

const exec = getExecService();

async function git(cwd: string, args: string[]) {
	const result = await exec.run('git', ['-C', cwd, ...args], {});

	if (!result.ok) {
		throw new Error(`git ${args.join(' ')}: ${result.reason}`);
	}

	return result.stdout;
}

describe('isNothingToCommit', () => {
	it.each([
		['nothing to commit, working tree clean', true],
		['no changes added to commit', true],
		['error: pathspec did not match', false]
	])('%j -> %s', (output, expected) => {
		expect(isNothingToCommit(output)).toBe(expected);
	});
});

describe('commitMessageFor', () => {
	it('names the plan and the bullet', () => {
		expect(
			commitMessageFor({ planTitle: 'Add login', sliceOrdinal: 2, sliceTitle: 'wire the route' })
		).toBe('Add login — slice 2: wire the route');
	});
});

describe('cleanTree', () => {
	let worktree: string;

	beforeEach(async () => {
		worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-clean-'));
		await git(worktree, ['init', '-b', 'main']);
		await git(worktree, ['config', 'user.email', 'a@b.c']);
		await git(worktree, ['config', 'user.name', 'Test']);
		fs.writeFileSync(path.join(worktree, 'kept.txt'), 'committed\n');
		await git(worktree, ['add', '-A']);
		await git(worktree, ['commit', '-m', 'first']);
	});

	afterEach(() => {
		fs.rmSync(worktree, { recursive: true, force: true });
	});

	function service() {
		return getCommitService({ exec });
	}

	// A bullet that failed leaves whatever it had written. Without this the retry
	// commits the failed session's half-finished work under its own name.
	it('discards what a failed bullet left behind', async () => {
		fs.writeFileSync(path.join(worktree, 'kept.txt'), 'half-written\n');
		fs.writeFileSync(path.join(worktree, 'stray.txt'), 'junk\n');

		expect((await service().cleanTree({ worktreePath: worktree, branch: 'main' })).ok).toBe(true);
		expect(fs.readFileSync(path.join(worktree, 'kept.txt'), 'utf8')).toBe('committed\n');
		expect(fs.existsSync(path.join(worktree, 'stray.txt'))).toBe(false);
	});

	// The whole point of retrying rather than requeuing: the bullets that landed
	// keep their commits, and only the one that failed runs again.
	it('keeps the commits the finished bullets made', async () => {
		fs.writeFileSync(path.join(worktree, 'second.txt'), 'slice two\n');
		await git(worktree, ['add', '-A']);
		await git(worktree, ['commit', '-m', 'second']);

		await service().cleanTree({ worktreePath: worktree, branch: 'main' });

		expect(fs.existsSync(path.join(worktree, 'second.txt'))).toBe(true);
		expect((await git(worktree, ['rev-list', '--count', 'HEAD'])).trim()).toBe('2');
	});

	it('is a no-op on a tree that is already clean', async () => {
		const before = await git(worktree, ['rev-parse', 'HEAD']);

		expect((await service().cleanTree({ worktreePath: worktree, branch: 'main' })).ok).toBe(true);
		expect(await git(worktree, ['rev-parse', 'HEAD'])).toBe(before);
	});

	// Retrying one bullet of an older plan is the case: the queue has moved the
	// worktree to a later plan's branch since, and a bullet that ran on whatever
	// was checked out would commit into the wrong pull request.
	it('checks out the branch the bullet belongs to', async () => {
		await git(worktree, ['checkout', '-b', 'bosun/plan/q/1-first']);
		fs.writeFileSync(path.join(worktree, 'first-plan.txt'), 'plan one\n');
		await git(worktree, ['add', '-A']);
		await git(worktree, ['commit', '-m', 'plan one']);
		await git(worktree, ['checkout', '-b', 'bosun/plan/q/2-second', 'main']);

		const cleaned = await service().cleanTree({
			worktreePath: worktree,
			branch: 'bosun/plan/q/1-first'
		});

		expect(cleaned.ok).toBe(true);
		expect((await git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()).toBe(
			'bosun/plan/q/1-first'
		);
		expect(fs.existsSync(path.join(worktree, 'first-plan.txt'))).toBe(true);
	});

	it('reports a branch that is not there rather than running on the wrong one', async () => {
		const cleaned = await service().cleanTree({ worktreePath: worktree, branch: 'no-such' });

		expect(cleaned.ok).toBe(false);
		expect(cleaned.detail).toContain('no-such');
	});
});
