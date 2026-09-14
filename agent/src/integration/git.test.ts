import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from '../services/exec.service';
import { getIntegrationGit, planNumbersIn } from './git';

const exec = getExecService();
const MIGRATIONS = 'be/drizzle-out/**';

async function git(cwd: string, args: string[]) {
	const result = await exec.run('git', ['-C', cwd, ...args], {});

	if (!result.ok) {
		throw new Error(`git ${args.join(' ')}: ${result.reason}`);
	}

	return result.stdout;
}

describe('planNumbersIn', () => {
	it('reads every plan a history names, once', () => {
		expect(
			planNumbersIn('Merge pull request #12 from o/bosun/plan/3-avatars\nMerge pull request #14 from o/bosun/plan/7-invites\nfix bosun/plan/3-avatars')
		).toEqual([3, 7]);
	});
});

describe('integration git', () => {
	const branch = 'bosun/plan/2-comments';
	let root: string;
	let worktree: string;
	let other: string;

	async function identify(cwd: string) {
		await git(cwd, ['config', 'user.email', 'a@b.c']);
		await git(cwd, ['config', 'user.name', 'Test']);
	}

	function write(cwd: string, file: string, content: string) {
		fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
		fs.writeFileSync(path.join(cwd, file), content);
	}

	async function commit(cwd: string, files: Record<string, string>, message: string) {
		for (const [file, content] of Object.entries(files)) {
			write(cwd, file, content);
		}

		await git(cwd, ['add', '-A']);
		await git(cwd, ['commit', '-m', message]);
	}

	beforeEach(async () => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-integrate-'));
		worktree = path.join(root, 'worktree');
		other = path.join(root, 'other');

		await git(root, ['init', '--bare', '-b', 'main', 'remote.git']);
		await git(root, ['init', '-b', 'main', 'worktree']);
		await identify(worktree);
		await git(worktree, ['remote', 'add', 'origin', path.join(root, 'remote.git')]);
		await commit(worktree, {
			'be/schema.ts': 'export const tables = [];\n',
			'be/drizzle-out/0001_init.sql': 'create table users ();\n',
			'be/drizzle-out/meta/_journal.json': '["0001_init"]\n'
		}, 'init');
		await git(worktree, ['push', '-u', 'origin', 'main']);
		await git(root, ['clone', path.join(root, 'remote.git'), 'other']);
		await identify(other);
		await git(worktree, ['checkout', '-b', branch]);
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	// Two plans each generate `0002`: the one that lands second is numbered against
	// what it lands on, because its generated files are never merged at all.
	it('takes the target\'s generated files so the migrations never conflict', async () => {
		await commit(worktree, {
			'be/drizzle-out/0002_comments.sql': 'create table comments ();\n',
			'be/drizzle-out/meta/_journal.json': '["0001_init","0002_comments"]\n'
		}, 'comments migration');
		await commit(other, {
			'be/drizzle-out/0002_invites.sql': 'create table invites ();\n',
			'be/drizzle-out/meta/_journal.json': '["0001_init","0002_invites"]\n'
		}, 'invites migration');
		await git(other, ['push', 'origin', 'main']);

		const integration = getIntegrationGit({ exec, worktreePath: worktree });
		const onto = await integration.fetchOnto('main');

		expect(onto.ok).toBe(true);

		const ref = onto.ok ? onto.value.ref : '';
		const taken = await integration.takeGenerated({ ontoRef: ref, globs: [MIGRATIONS] });

		expect(taken).toEqual({ ok: true, value: ['be/drizzle-out/0002_comments.sql', 'be/drizzle-out/meta/_journal.json'] });

		const merged = await integration.merge(ref);

		expect(merged).toEqual({ ok: true, value: [] });
		expect(fs.existsSync(path.join(worktree, 'be/drizzle-out/0002_comments.sql'))).toBe(false);
		expect(fs.readFileSync(path.join(worktree, 'be/drizzle-out/meta/_journal.json'), 'utf8')).toBe('["0001_init","0002_invites"]\n');
	});

	it('reports a real conflict, sees it resolved, and abandons back to where it started', async () => {
		await commit(worktree, { 'be/schema.ts': 'export const tables = [\'comments\'];\n' }, 'comments table');
		await commit(other, { 'be/schema.ts': 'export const tables = [\'invites\'];\n' }, 'invites table');
		await git(other, ['push', 'origin', 'main']);

		const integration = getIntegrationGit({ exec, worktreePath: worktree });
		const preHead = await integration.headSha();
		const onto = await integration.fetchOnto('main');
		const ref = onto.ok ? onto.value.ref : '';
		const merged = await integration.merge(ref);

		expect(merged).toEqual({ ok: true, value: ['be/schema.ts'] });
		expect(await integration.unresolved(['be/schema.ts'])).toEqual(['be/schema.ts']);

		write(worktree, 'be/schema.ts', 'export const tables = [\'comments\', \'invites\'];\n');

		expect(await integration.unresolved(['be/schema.ts'])).toEqual([]);

		await integration.abandon(preHead!);

		expect(await integration.mergeInProgress()).toBe(false);
		expect(await integration.headSha()).toBe(preHead);
		expect(fs.readFileSync(path.join(worktree, 'be/schema.ts'), 'utf8')).toBe('export const tables = [\'comments\'];\n');
	});

	// What a regenerate rule is credited with is what its command changed, not what
	// the merge brought in beside it.
	it('credits a regenerate command with only the files it changed', async () => {
		await commit(other, { 'be/drizzle-out/0002_invites.sql': 'create table invites ();\n' }, 'invites migration');
		await git(other, ['push', 'origin', 'main']);

		const integration = getIntegrationGit({ exec, worktreePath: worktree });
		const onto = await integration.fetchOnto('main');

		await integration.merge(onto.ok ? onto.value.ref : '');
		await integration.stageAll([]);
		write(worktree, 'be/drizzle-out/0003_comments.sql', 'create table comments ();\n');

		expect(await integration.changedUnder([MIGRATIONS])).toEqual(['be/drizzle-out/0003_comments.sql']);
	});

	it('finds nothing to merge when the target is already contained', async () => {
		const integration = getIntegrationGit({ exec, worktreePath: worktree });
		const onto = await integration.fetchOnto('main');

		expect(await integration.contains(onto.ok ? onto.value.ref : '')).toBe(true);
	});
});
