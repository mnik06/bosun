import { describe, expect, it } from 'vitest';
import { type ExecResult, type ExecService } from './exec.service';
import { withSerializedFetches } from './git-fetch-queue';

const OK: ExecResult = { ok: true, stdout: '', stderr: '', reason: '' };

const RACE: ExecResult = {
	ok: false,
	stdout: '',
	stderr: 'error: fetching ref refs/remotes/origin/main failed: incorrect old value provided',
	reason: 'error: fetching ref refs/remotes/origin/main failed: incorrect old value provided'
};

function fakeExec(results: ExecResult[] = []) {
	const calls: string[][] = [];
	let active = 0;
	let maxActive = 0;

	const exec: ExecService = {
		async run(_command, args) {
			calls.push(args);
			active += 1;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;

			return results.shift() ?? OK;
		}
	};

	return { exec, calls, maxActive: () => maxActive };
}

describe('withSerializedFetches', () => {
	it('never runs two fetches at once, from any worktree', async () => {
		const fake = fakeExec();
		const exec = withSerializedFetches(fake.exec, { retryMs: 0 });

		await Promise.all([
			exec.run('git', ['-C', '/w/a', 'fetch', 'origin', '--prune']),
			exec.run('git', ['-C', '/w/b', 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main']),
			exec.run('git', ['fetch', '--all'])
		]);

		expect(fake.maxActive()).toBe(1);
		expect(fake.calls).toHaveLength(3);
	});

	it('leaves every other command concurrent', async () => {
		const fake = fakeExec();
		const exec = withSerializedFetches(fake.exec, { retryMs: 0 });

		await Promise.all([
			exec.run('git', ['-C', '/w/a', 'rev-parse', 'HEAD']),
			exec.run('git', ['-C', '/w/fetch', 'status']),
			exec.run('pnpm', ['fetch'])
		]);

		expect(fake.maxActive()).toBe(3);
	});

	it('retries a fetch that lost a ref race once', async () => {
		const fake = fakeExec([RACE, OK]);
		const exec = withSerializedFetches(fake.exec, { retryMs: 0 });

		expect(await exec.run('git', ['-C', '/w/a', 'fetch', 'origin'])).toEqual(OK);
		expect(fake.calls).toHaveLength(2);
	});

	it('does not retry any other failure', async () => {
		const unreachable: ExecResult = { ok: false, stdout: '', stderr: 'fatal: could not read from remote', reason: 'fatal: could not read from remote' };
		const fake = fakeExec([unreachable]);
		const exec = withSerializedFetches(fake.exec, { retryMs: 0 });

		expect(await exec.run('git', ['fetch', 'origin'])).toEqual(unreachable);
		expect(fake.calls).toHaveLength(1);
	});
});
