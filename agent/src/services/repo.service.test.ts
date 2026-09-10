import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from './exec.service';
import { getRepoService } from './repo.service';

const exec = getExecService();

async function git(cwd: string, args: string[]) {
	const result = await exec.run('git', ['-C', cwd, ...args], { timeoutMs: 60_000 });

	if (!result.ok) {
		throw new Error(`git ${args.join(' ')}: ${result.reason}`);
	}

	return result.stdout;
}

async function identify(cwd: string) {
	await git(cwd, ['config', 'user.email', 'a@b.c']);
	await git(cwd, ['config', 'user.name', 'Test']);
}

describe('repo service', () => {
	let home: string;
	let origin: string;
	let repoPath: string;
	let elsewhere: string;

	beforeEach(async () => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-repo-'));
		origin = path.join(home, 'origin.git');
		repoPath = path.join(home, 'repo');
		elsewhere = path.join(home, 'elsewhere');

		fs.mkdirSync(origin);
		await git(origin, ['init', '--bare', '-b', 'main']);

		fs.mkdirSync(elsewhere);
		await git(elsewhere, ['init', '-b', 'main']);
		await identify(elsewhere);
		fs.writeFileSync(path.join(elsewhere, 'README.md'), 'first\n');
		await git(elsewhere, ['add', '-A']);
		await git(elsewhere, ['commit', '-m', 'first']);
		await git(elsewhere, ['remote', 'add', 'origin', origin]);
		await git(elsewhere, ['push', '-u', 'origin', 'main']);

		await exec.run('git', ['clone', origin, repoPath], { timeoutMs: 60_000 });
		await identify(repoPath);
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service() {
		return getRepoService({ exec, repoPath, homeDir: home });
	}

	// The whole point of the service: a machine that has been connected for days
	// has remote refs from days ago, and a session reading that tree concludes
	// something is missing when it landed on Tuesday.
	it('reads the commit the remote has now, not the one the checkout last saw', async () => {
		fs.writeFileSync(path.join(elsewhere, 'LANDED.md'), 'merged while nobody looked\n');
		await git(elsewhere, ['add', '-A']);
		await git(elsewhere, ['commit', '-m', 'second']);
		await git(elsewhere, ['push', 'origin', 'main']);

		const landed = await git(elsewhere, ['rev-parse', 'HEAD']);
		const tree = await service().readTree();

		expect(tree.fresh).toBe(true);
		expect(tree.ref).toBe('origin/main');
		expect(tree.sha).toBe(landed);
		expect(fs.existsSync(path.join(tree.path, 'LANDED.md'))).toBe(true);
	});

	it('moves an existing read tree forward on the next session', async () => {
		const first = await service().readTree();

		fs.writeFileSync(path.join(elsewhere, 'LATER.md'), 'later\n');
		await git(elsewhere, ['add', '-A']);
		await git(elsewhere, ['commit', '-m', 'third']);
		await git(elsewhere, ['push', 'origin', 'main']);

		const second = await service().readTree();

		expect(second.path).toBe(first.path);
		expect(second.sha).not.toBe(first.sha);
		expect(fs.existsSync(path.join(second.path, 'LATER.md'))).toBe(true);
	});

	// The machine's checkout is never touched: it is the operator's, and it can be
	// dirty or parked on an unrelated branch.
	it('leaves the machine checkout where it was', async () => {
		await git(repoPath, ['checkout', '-b', 'operator-branch']);
		fs.writeFileSync(path.join(repoPath, 'WIP.md'), 'half finished\n');

		const tree = await service().readTree();

		expect(tree.path).not.toBe(repoPath);
		expect(await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('operator-branch');
		expect(fs.existsSync(path.join(repoPath, 'WIP.md'))).toBe(true);
	});

	// `.env` and its neighbours exist only in the machine's checkout, and a session
	// reading the repository to learn its conventions cannot find them anywhere else.
	it('carries untracked files across', async () => {
		fs.writeFileSync(path.join(repoPath, '.env'), 'SECRET=1\n');

		const tree = await service().readTree();

		expect(fs.readFileSync(path.join(tree.path, '.env'), 'utf8')).toBe('SECRET=1\n');
	});

	// A session still runs, on the tree that is there, and is told what it is
	// reading rather than left to treat it as current.
	it('falls back to the machine checkout when there is no repository', async () => {
		const notARepo = path.join(home, 'plain');

		fs.mkdirSync(notARepo);

		const tree = await getRepoService({
			exec,
			repoPath: notARepo,
			homeDir: home
		}).readTree();

		expect(tree.fresh).toBe(false);
		expect(tree.path).toBe(notARepo);
		expect(tree.detail).toContain('not a git repository');
	});

	it('treats a clone with no remote as nothing to fetch', async () => {
		await git(repoPath, ['remote', 'remove', 'origin']);

		const result = await service().fetch();

		expect(result.ok).toBe(true);
		expect(result.detail).toBe('no remote to fetch from');
	});
});
