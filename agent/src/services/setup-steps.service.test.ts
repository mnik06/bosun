import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { getExecService } from './exec.service';
import { getSetupStepsService, runShell } from './setup-steps.service';
import { parseProjectConfig, type ProjectConfig } from '../project-config';

const dirs: string[] = [];

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-setup-'));

	dirs.push(dir);

	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function config(yaml: string): ProjectConfig {
	const parsed = parseProjectConfig(yaml);

	if (!parsed.ok) {
		throw new Error(JSON.stringify(parsed.issues));
	}

	return parsed.config;
}

function harness() {
	const home = tempDir();
	const worktreePath = tempDir();

	fs.mkdirSync(path.join(worktreePath, 'be'));
	fs.writeFileSync(path.join(worktreePath, 'be', 'pnpm-lock.yaml'), 'lock: 1\n');

	const steps = config(`version: 1
setup:
  - name: install be
    cwd: be
    run: echo install >> ${path.join(worktreePath, 'ran.log')}
    rerunWhen: [be/pnpm-lock.yaml]
  - name: generate
    run: echo generate >> ran.log
`);

	return {
		worktreePath,
		steps,
		ran: () => fs.readFileSync(path.join(worktreePath, 'ran.log'), 'utf8').trim().split('\n'),
		service: getSetupStepsService({ exec: getExecService(), homeDir: home })
	};
}

describe('setup steps', () => {
	it('runs every step in order, each in its own cwd', async () => {
		const { service, steps, worktreePath, ran } = harness();

		expect(await service.runAll({ key: 'q', worktreePath, config: steps, env: process.env })).toEqual({
			ok: true,
			ran: ['install be', 'generate']
		});
		expect(ran()).toEqual(['install', 'generate']);
	});

	// A worktree otherwise keeps the dependencies it was created with for every plan
	// that follows, however many of them changed the lockfile.
	it('re-runs only the step whose watched file changed, and only once per change', async () => {
		const { service, steps, worktreePath, ran } = harness();

		await service.runAll({ key: 'q', worktreePath, config: steps, env: process.env });
		expect(await service.rerunChanged({ key: 'q', worktreePath, config: steps, env: process.env })).toEqual({ ok: true, ran: [] });

		fs.writeFileSync(path.join(worktreePath, 'be', 'pnpm-lock.yaml'), 'lock: 2\n');

		expect(await service.rerunChanged({ key: 'q', worktreePath, config: steps, env: process.env })).toEqual({ ok: true, ran: ['install be'] });
		expect(await service.rerunChanged({ key: 'q', worktreePath, config: steps, env: process.env })).toEqual({ ok: true, ran: [] });
		expect(ran()).toEqual(['install', 'generate', 'install']);
	});

	it('fails with the step\'s name and output tail, and tries that step again next time', async () => {
		const { service, worktreePath } = harness();
		const flaky = config(`version: 1
setup:
  - name: install
    run: test -f ok || { echo "ERR_PNPM_NO_LOCKFILE"; exit 3; }
    rerunWhen: [lock]
`);

		const failed = await service.runAll({ key: 'q', worktreePath, config: flaky, env: process.env });

		expect(failed).toEqual({
			ok: false,
			step: 'install',
			message: 'setup step "install" failed (exited with 3):\nERR_PNPM_NO_LOCKFILE'
		});

		fs.writeFileSync(path.join(worktreePath, 'ok'), '');

		expect(await service.rerunChanged({ key: 'q', worktreePath, config: flaky, env: process.env })).toEqual({ ok: true, ran: ['install'] });
	});

	it('keeps only the tail of an output too large to buffer', async () => {
		const result = await runShell({
			command: 'i=0; while [ $i -lt 20000 ]; do echo "line $i"; i=$((i+1)); done',
			cwd: tempDir(),
			env: process.env
		});

		expect(result.ok).toBe(true);
		expect(result.tail.length).toBeLessThanOrEqual(4000);
		expect(result.tail.trim().endsWith('line 19999')).toBe(true);
	});
});
