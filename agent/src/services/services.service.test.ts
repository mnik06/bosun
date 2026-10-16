import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseProjectConfig, type ProjectConfig } from '../project-config';
import { getServicesService } from './services.service';
import { type ShellResult } from './setup-steps.service';

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-services-'));

	dirs.push(dir);

	return dir;
}

function config(): ProjectConfig {
	const parsed = parseProjectConfig('Services:\ndb:\n- Start: db-up\n- Check: db-status\n- Stop: db-down\n- Ready timeout: 5\n');

	if (!parsed.ok) {
		throw new Error(JSON.stringify(parsed.issues));
	}

	return parsed.config;
}

const OK: ShellResult = { ok: true, tail: '', detail: 'done' };
const FAILED: ShellResult = { ok: false, tail: 'not running', detail: 'exited with 1' };

// The shell answers each command from its own queue of results, the last one
// repeating once the queue runs dry.
function harness(results: Record<string, ShellResult[]>) {
	const calls: string[] = [];
	const runShell = vi.fn(async (opts: { command: string }) => {
		calls.push(opts.command);

		const queue = results[opts.command] ?? [OK];

		return queue.length > 1 ? queue.shift()! : queue[0]!;
	});
	const service = getServicesService({ homeDir: tempDir(), runShell, pollMs: 1 });

	return { calls, service, ensure: async () => service.ensure({ config: config(), worktreePath: tempDir(), env: {} }) };
}

describe('services', () => {
	it('starts nothing when the check already passes', async () => {
		const { calls, ensure } = harness({ 'db-status': [OK] });

		expect(await ensure()).toEqual({ ok: true });
		expect(calls).toEqual(['db-status']);
	});

	it('starts a service whose check fails, then waits for the check to pass', async () => {
		const { calls, ensure } = harness({ 'db-status': [FAILED, FAILED, OK] });

		expect(await ensure()).toEqual({ ok: true });
		expect(calls).toEqual(['db-status', 'db-up', 'db-status', 'db-status']);
	});

	it('names the service, the step and the tail when start fails', async () => {
		const { ensure } = harness({ 'db-status': [FAILED], 'db-up': [{ ok: false, tail: 'permission denied on docker.sock\n', detail: 'exited with 1' }] });

		expect(await ensure()).toEqual({
			ok: false,
			service: 'db',
			reason: 'start failed (exited with 1)',
			tail: 'permission denied on docker.sock',
			detail: 'service "db" start failed (exited with 1):\npermission denied on docker.sock'
		});
	});

	// Two builds taking a slot at once would otherwise both see the check fail and
	// both run the start command against the same containers.
	it('serialises concurrent ensures, so the second sees the first one up', async () => {
		let up = false;
		const starts: number[] = [];
		const runShell = vi.fn(async (opts: { command: string }) => {
			if (opts.command === 'db-up') {
				starts.push(Date.now());
				await new Promise((resolve) => setTimeout(resolve, 20));
				up = true;

				return OK;
			}

			return up ? OK : FAILED;
		});
		const service = getServicesService({ homeDir: tempDir(), runShell, pollMs: 1 });
		const worktreePath = tempDir();

		const results = await Promise.all([
			service.ensure({ config: config(), worktreePath, env: {} }),
			service.ensure({ config: config(), worktreePath, env: {} })
		]);

		expect(results).toEqual([{ ok: true }, { ok: true }]);
		expect(starts).toHaveLength(1);
	});

	it('stops what the last ensure recorded, in the checkout once that worktree is gone', async () => {
		const home = tempDir();
		const worktreePath = tempDir();
		const checkoutPath = tempDir();
		const cwds: string[] = [];
		const runShell = vi.fn(async (opts: { command: string; cwd: string }) => {
			cwds.push(`${opts.command} in ${opts.cwd}`);

			return OK;
		});
		const service = getServicesService({ homeDir: home, runShell, pollMs: 1 });

		await service.ensure({ config: config(), worktreePath, env: { PATH: '/toolchain/bin' } });
		fs.rmSync(worktreePath, { recursive: true, force: true });
		cwds.length = 0;

		await service.stopAll({ checkoutPath, env: {} });

		expect(cwds).toEqual([`db-down in ${checkoutPath}`]);
		expect(fs.statSync(path.join(home, '.bosun', 'services.json')).mode & 0o777).toBe(0o600);
	});
});
