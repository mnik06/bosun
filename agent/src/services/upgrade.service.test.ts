import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from './exec.service';
import { assetNameFor, decideUpgrade, findChecksum, getUpgradeService } from './upgrade.service';

describe('assetNameFor', () => {
	it.each([
		['x64', 'bosun-agent-linux-x64'],
		['arm64', 'bosun-agent-linux-arm64']
	])('%s -> %s', (arch, expected) => {
		expect(assetNameFor(arch)).toBe(expected);
	});

	it('refuses an architecture with no published build', () => {
		expect(assetNameFor('ia32')).toBeNull();
	});
});

describe('findChecksum', () => {
	const sums = 'aaa  bosun-agent-linux-x64\nbbb  bosun-agent-linux-arm64\n';

	it('finds the line for the asset', () => {
		expect(findChecksum({ sums, asset: 'bosun-agent-linux-arm64' })).toBe('bbb');
	});

	// shasum writes binary entries with a leading '*', the same shape install.sh
	// already accepts.
	it('accepts the binary-mode star prefix', () => {
		expect(findChecksum({ sums: 'ccc *bosun-agent-linux-x64', asset: 'bosun-agent-linux-x64' })).toBe(
			'ccc'
		);
	});

	// A published release with no entry for this asset must fail closed, not
	// install something unverified.
	it('returns null when the asset is not listed', () => {
		expect(findChecksum({ sums, asset: 'bosun-agent-linux-riscv' })).toBeNull();
	});
});

describe('decideUpgrade', () => {
	const base = { current: '2.0.0', target: '2.1.0', blocked: [], sessionsRunning: 0, selfContained: true };

	it('proceeds for a new version on an idle packaged binary', () => {
		expect(decideUpgrade(base).proceed).toBe(true);
	});

	it('does nothing when already on the target', () => {
		expect(decideUpgrade({ ...base, target: '2.0.0' }).proceed).toBe(false);
	});

	// Replacing the running executable would mean replacing node itself.
	it('refuses when not running as a packaged binary', () => {
		expect(decideUpgrade({ ...base, selfContained: false })).toMatchObject({ proceed: false });
	});

	// A session in flight has a question on somebody's screen; the restart would
	// drop it.
	it('defers while a session is running', () => {
		const decision = decideUpgrade({ ...base, sessionsRunning: 1 });

		expect(decision.proceed).toBe(false);
		expect(decision.reason).toContain('session');
		// Nothing an operator can overrule: the restart would kill the bullet.
		expect(decision.retryable).toBe(false);
	});

	// Without this the backend re-offers the bad build, the rollback restores the
	// old one, and the machine flaps between them indefinitely.
	// The one refusal an operator can overrule, and the only one `force` touches:
	// a build that failed here may have been fixed, or the failure may have been
	// this machine rather than the release.
	it('lets a forced offer through the block list, and nothing else', () => {
		expect(decideUpgrade({ ...base, blocked: ['2.1.0'], force: true }).proceed).toBe(true);
		expect(
			decideUpgrade({ ...base, blocked: ['2.1.0'], sessionsRunning: 1, force: true }).proceed
		).toBe(false);
		expect(decideUpgrade({ ...base, selfContained: false, force: true }).proceed).toBe(false);
	});

	it('marks a blocked version as worth retrying and a busy machine as not', () => {
		expect(decideUpgrade({ ...base, blocked: ['2.1.0'] }).retryable).toBe(true);
		expect(decideUpgrade({ ...base, sessionsRunning: 2 }).retryable).toBe(false);
	});

	it('never retries a version that already failed to start', () => {
		expect(decideUpgrade({ ...base, blocked: ['2.1.0'] }).proceed).toBe(false);
	});
});

describe('probation and rollback', () => {
	let home: string;
	let binPath: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-upg-'));
		fs.mkdirSync(path.join(home, '.bosun'));
		binPath = path.join(home, 'bosun-agent');
		fs.writeFileSync(binPath, 'NEW', { mode: 0o755 });
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service() {
		return getUpgradeService({ exec: getExecService(), homeDir: home, execPath: binPath });
	}

	// The state a build is in on its *second* boot: installed, started once, and
	// still never seen on a socket.
	function underProbation(version: string) {
		fs.writeFileSync(path.join(home, '.bosun', 'upgrade-probation'), `${version}\n1\n`);
		fs.writeFileSync(`${binPath}.previous`, 'OLD', { mode: 0o755 });
	}

	it('restores the previous binary when the new one never connected', () => {
		underProbation('2.1.0');

		expect(service().rollbackIfFailed('2.1.0')).toBe('2.1.0');
		expect(fs.readFileSync(binPath, 'utf8')).toBe('OLD');
	});

	it('blocks the version it rolled back from', () => {
		underProbation('2.1.0');
		service().rollbackIfFailed('2.1.0');

		expect(service().blocked()).toEqual(['2.1.0']);
	});

	// A probation file naming some other version is not this boot's problem.
	it('leaves the binary alone when probation names a different version', () => {
		underProbation('2.1.0');

		expect(service().rollbackIfFailed('2.0.0')).toBeNull();
		expect(fs.readFileSync(binPath, 'utf8')).toBe('NEW');
	});

	// The evidence that matters is a working connection, and clearing the file is
	// what stops the next restart treating a healthy build as a failed one.
	it('does not roll back once probation is cleared', () => {
		underProbation('2.1.0');
		service().clearProbation();

		expect(service().rollbackIfFailed('2.1.0')).toBeNull();
		expect(fs.readFileSync(binPath, 'utf8')).toBe('NEW');
	});

	it('does nothing when there is no previous binary to restore', () => {
		fs.writeFileSync(path.join(home, '.bosun', 'upgrade-probation'), '2.1.0');

		expect(service().rollbackIfFailed('2.1.0')).toBeNull();
	});

	it('knows a node process is not a packaged binary', () => {
		const asNode = getUpgradeService({
			exec: getExecService(),
			homeDir: home,
			execPath: '/usr/local/bin/node'
		});

		expect(asNode.selfContained).toBe(false);
	});
});
