import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from '../services/exec.service';
import { bootstrapBareRemote, git, identify } from '../test-support/git-fixture';
import { commitMessageFor, getCommitService, isNothingToCommit, mergeBranches } from './commit';

const exec = getExecService();

describe('isNothingToCommit', () => {
	it.each([
		['nothing to commit, working tree clean', true],
		['no changes added to commit', true],
		['nothing added to commit but untracked files present', true],
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

	// A bullet that ran on whatever was checked out would commit into the wrong
	// pull request the day anything else moved the worktree.
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

describe('commitAll', () => {
	let worktree: string;

	beforeEach(async () => {
		worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-commit-'));
		await git(worktree, ['init', '-b', 'main']);
		await git(worktree, ['config', 'user.email', 'a@b.c']);
		await git(worktree, ['config', 'user.name', 'Test']);
		fs.writeFileSync(path.join(worktree, 'kept.txt'), 'committed\n');
		fs.mkdirSync(path.join(worktree, 'be'));
		await git(worktree, ['add', '-A']);
		await git(worktree, ['commit', '-m', 'first']);
		fs.writeFileSync(path.join(worktree, 'be', '.env'), 'DATABASE_URL=postgres://hunter2\n');
	});

	afterEach(() => {
		fs.rmSync(worktree, { recursive: true, force: true });
	});

	// A repository that does not ignore `.env` would otherwise put the operator's
	// connection string into the plan branch and push it with the pull request.
	it('keeps the env files bosun wrote out of the commit, and in the tree', async () => {
		fs.writeFileSync(path.join(worktree, 'feature.txt'), 'work\n');

		const committed = await getCommitService({ exec }).commitAll({
			worktreePath: worktree,
			message: 'bullet',
			keepOut: ['be/.env']
		});

		expect(committed.ok).toBe(true);
		expect((await git(worktree, ['show', '--name-only', '--format=', 'HEAD'])).trim()).toBe('feature.txt');
		expect(fs.existsSync(path.join(worktree, 'be', '.env'))).toBe(true);
	});

	// A verify bullet usually changes nothing, and the env file left untracked must
	// not turn that into a failed commit.
	it('reports nothing to commit when the env file is all that changed', async () => {
		const committed = await getCommitService({ exec }).commitAll({
			worktreePath: worktree,
			message: 'bullet',
			keepOut: ['be/.env']
		});

		expect(committed).toEqual({ ok: true, commitSha: null, detail: 'nothing to commit' });
	});
});

describe('the plan branch on the remote', () => {
	const branch = 'bosun/plan/1-first';
	let root: string;
	let worktree: string;
	let other: string;

	async function commitFile(cwd: string, file: string, content: string) {
		fs.writeFileSync(path.join(cwd, file), content);
		await git(cwd, ['add', '-A']);
		await git(cwd, ['commit', '-m', file]);
	}

	beforeEach(async () => {
		({ root, worktree, other } = await bootstrapBareRemote('bosun-sync-'));

		await commitFile(worktree, 'base.txt', 'base\n');
		await git(worktree, ['push', '-u', 'origin', 'main']);
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	async function cloneOther() {
		await git(root, ['clone', path.join(root, 'remote.git'), 'other']);
		await identify(other);
	}

	async function pushFromOther(file: string, content: string) {
		await git(other, ['fetch', 'origin']);
		await git(other, ['checkout', '-B', branch, `origin/${branch}`]);
		await commitFile(other, file, content);
		await git(other, ['push', 'origin', branch]);
	}

	// Found on a real plan: a commit landed on the pushed plan branch while the
	// worktree kept building, and the push at the end was refused.
	it('brings in what the remote gained, so the push is a fast-forward', async () => {
		await git(worktree, ['checkout', '-b', branch]);
		await commitFile(worktree, 'slice-one.txt', 'one\n');
		await git(worktree, ['push', '-u', 'origin', branch]);
		await cloneOther();
		await pushFromOther('review.txt', 'reviewer fix\n');
		await commitFile(worktree, 'slice-two.txt', 'two\n');

		const cleaned = await getCommitService({ exec }).cleanTree({ worktreePath: worktree, branch });

		expect(cleaned.ok).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'review.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'slice-two.txt'))).toBe(true);
		expect((await exec.run('git', ['-C', worktree, 'push', 'origin', branch], {})).ok).toBe(true);
	});

	it('continues a branch the remote already has instead of cutting it again', async () => {
		await cloneOther();
		await git(other, ['checkout', '-b', branch]);
		await commitFile(other, 'earlier-run.txt', 'pushed before\n');
		await git(other, ['push', 'origin', branch]);

		const started = await getCommitService({ exec }).startBuildBranch({
			worktreePath: worktree,
			branch,
			baseRef: 'main',
			fresh: true,
			startFrom: null,
			mergeIn: []
		});

		expect(started.ok).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'earlier-run.txt'))).toBe(true);
		expect(await git(worktree, ['rev-parse', 'HEAD'])).toBe(
			await git(worktree, ['rev-parse', `origin/${branch}`])
		);
	});

	// A merge left half-applied would be committed, markers and all, by the bullet
	// that runs next.
	it('refuses a remote it conflicts with and leaves no merge in progress', async () => {
		await git(worktree, ['checkout', '-b', branch]);
		await commitFile(worktree, 'shared.txt', 'first\n');
		await git(worktree, ['push', '-u', 'origin', branch]);
		await cloneOther();
		await pushFromOther('shared.txt', 'theirs\n');
		await commitFile(worktree, 'shared.txt', 'mine\n');

		const cleaned = await getCommitService({ exec }).cleanTree({ worktreePath: worktree, branch });

		expect(cleaned.ok).toBe(false);
		expect(cleaned.detail).toContain(`origin/${branch}`);
		expect((await exec.run('git', ['-C', worktree, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], {})).ok).toBe(
			false
		);
		expect(fs.readFileSync(path.join(worktree, 'shared.txt'), 'utf8')).toBe('mine\n');
	});
});

describe('a stacked plan', () => {
	const provider = 'bosun/plan/3-avatars';
	const second = 'bosun/plan/5-invites';
	const dependent = 'bosun/plan/4-comments';
	let root: string;
	let worktree: string;
	let other: string;

	async function commitFile(cwd: string, file: string, content: string) {
		fs.writeFileSync(path.join(cwd, file), content);
		await git(cwd, ['add', '-A']);
		await git(cwd, ['commit', '-m', file]);
	}

	beforeEach(async () => {
		({ root, worktree, other } = await bootstrapBareRemote('bosun-stack-'));

		await commitFile(worktree, 'base.txt', 'base\n');
		await git(worktree, ['push', '-u', 'origin', 'main']);
		await git(root, ['clone', path.join(root, 'remote.git'), 'other']);
		await identify(other);
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	async function pushProvider(name: string, files: string[]): Promise<string[]> {
		const shas: string[] = [];

		await git(other, ['checkout', '-B', name, 'origin/main']);

		for (const file of files) {
			await commitFile(other, file, `${file}\n`);
			shas.push(await git(other, ['rev-parse', 'HEAD']));
		}

		await git(other, ['push', '-f', 'origin', name]);

		return shas;
	}

	// The bug this replaced: a dependent was cut from the base, which does not hold
	// the provider's work until somebody merges it.
	it('starts from the provider commit the dependency was satisfied by, not from the base', async () => {
		const [foundation] = await pushProvider(provider, ['foundation.txt', 'later.txt']);

		const started = await getCommitService({ exec }).startBuildBranch({
			worktreePath: worktree,
			branch: dependent,
			baseRef: 'main',
			fresh: true,
			startFrom: foundation!,
			mergeIn: []
		});

		expect(started.ok).toBe(true);
		expect(await git(worktree, ['rev-parse', 'HEAD'])).toBe(foundation);
		expect(fs.existsSync(path.join(worktree, 'foundation.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'later.txt'))).toBe(false);
	});

	it('merges every provider it names into its starting point', async () => {
		await pushProvider(provider, ['avatars.txt']);
		await pushProvider(second, ['invites.txt']);

		const started = await getCommitService({ exec }).startBuildBranch({
			worktreePath: worktree,
			branch: dependent,
			baseRef: 'main',
			fresh: true,
			startFrom: null,
			mergeIn: [provider, second]
		});

		expect(started.ok).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'avatars.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'invites.txt'))).toBe(true);
	});

	// Before each bullet a stacked plan brings in what its provider gained, and a
	// provider already contained costs nothing but the fetch.
	it('brings in what a provider gained since, and nothing twice', async () => {
		await pushProvider(provider, ['avatars.txt']);
		await getCommitService({ exec }).startBuildBranch({
			worktreePath: worktree,
			branch: dependent,
			baseRef: 'main',
			fresh: true,
			startFrom: null,
			mergeIn: [provider]
		});
		await git(other, ['checkout', provider]);
		await commitFile(other, 'avatars-v2.txt', 'more\n');
		await git(other, ['push', 'origin', provider]);

		const merged = await mergeBranches({ exec, worktreePath: worktree, branches: [provider] });
		const again = await mergeBranches({ exec, worktreePath: worktree, branches: [provider] });

		expect(merged.ok).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'avatars-v2.txt'))).toBe(true);
		expect(again.detail).toBe('providers already contained');
	});

	it('refuses a provider it conflicts with and leaves no merge in progress', async () => {
		await pushProvider(provider, ['shared.txt']);
		await git(worktree, ['checkout', '-b', dependent]);
		fs.writeFileSync(path.join(worktree, 'shared.txt'), 'mine\n');
		await git(worktree, ['add', '-A']);
		await git(worktree, ['commit', '-m', 'mine']);

		const merged = await mergeBranches({ exec, worktreePath: worktree, branches: [provider] });

		expect(merged.ok).toBe(false);
		expect(merged.detail).toContain(`origin/${provider}`);
		expect(merged.conflictWith).toBe(provider);
		expect((await exec.run('git', ['-C', worktree, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], {})).ok).toBe(false);
	});

	// A build resuming after a hold keeps commits a failed push left only here; cut
	// again from the remote, they would be gone.
	it('keeps a resuming build\'s own commits', async () => {
		await git(worktree, ['checkout', '-b', dependent]);
		await commitFile(worktree, 'unpushed.txt', 'only here\n');
		await git(worktree, ['checkout', 'main']);

		const started = await getCommitService({ exec }).startBuildBranch({
			worktreePath: worktree,
			branch: dependent,
			baseRef: 'main',
			fresh: false,
			startFrom: null,
			mergeIn: []
		});

		expect(started.ok).toBe(true);
		expect(fs.existsSync(path.join(worktree, 'unpushed.txt'))).toBe(true);
	});
});
