import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from './exec.service';
import { assetNameFor, getUpgradeService } from './upgrade.service';

const ASSET = assetNameFor(process.arch)!;

// A stand-in for the published binary: something that runs and prints a version,
// which is exactly what the staged-binary probe checks before the swap.
function fakeBinary(version: string): Buffer {
	return Buffer.from(`#!/bin/sh\necho "${version}"\n`);
}

function serve(opts: { binary: Buffer; sums: string }) {
	const server = http.createServer((req, res) => {
		if (req.url === `/${ASSET}`) {
			res.writeHead(200).end(opts.binary);

			return;
		}

		if (req.url === '/SHA256SUMS') {
			res.writeHead(200).end(opts.sums);

			return;
		}

		res.writeHead(404).end();
	});

	return new Promise<{ url: string; close: () => void }>((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;

			resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
		});
	});
}

function sumsFor(binary: Buffer): string {
	return `${crypto.createHash('sha256').update(binary).digest('hex')}  ${ASSET}\n`;
}

describe('upgrade apply', () => {
	let home: string;
	let binPath: string;
	let release: { url: string; close: () => void } | null = null;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-apply-'));
		fs.mkdirSync(path.join(home, '.bosun'));
		binPath = path.join(home, 'bosun-agent');
		fs.writeFileSync(binPath, fakeBinary('2.0.0'), { mode: 0o755 });
	});

	afterEach(() => {
		release?.close();
		release = null;
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service() {
		return getUpgradeService({ exec: getExecService(), homeDir: home, execPath: binPath });
	}

	async function apply(opts: { binary: Buffer; sums?: string; version?: string }) {
		release = await serve({ binary: opts.binary, sums: opts.sums ?? sumsFor(opts.binary) });

		return service().apply({ version: opts.version ?? '2.1.0', downloadBaseUrl: release.url });
	}

	it('installs a verified build and keeps the one it replaced', async () => {
		await apply({ binary: fakeBinary('2.1.0') });

		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.1.0');
		expect(fs.readFileSync(`${binPath}.previous`, 'utf8')).toContain('2.0.0');
		expect(fs.statSync(binPath).mode & 0o777).toBe(0o755);
	});

	// The file that says "this boot installed a version and has not proved it
	// works yet". Without it a build that cannot connect never rolls back.
	it('leaves the machine on probation for the version it installed', async () => {
		await apply({ binary: fakeBinary('2.1.0') });

		expect(fs.readFileSync(path.join(home, '.bosun', 'upgrade-probation'), 'utf8')).toBe(
			'2.1.0\n0\n'
		);
	});

	// Not optional. Anyone who can tamper with the download base would otherwise
	// get arbitrary code execution on every machine that upgrades.
	it('refuses a binary whose checksum does not match', async () => {
		await expect(
			apply({ binary: fakeBinary('2.1.0'), sums: `${'0'.repeat(64)}  ${ASSET}\n` })
		).rejects.toThrow(/checksum mismatch/);

		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.0.0');
	});

	it('refuses a release that publishes no checksum for this asset', async () => {
		await expect(
			apply({ binary: fakeBinary('2.1.0'), sums: 'deadbeef  some-other-file\n' })
		).rejects.toThrow(/no checksum published/);

		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.0.0');
	});

	// A truncated or wrong-arch download passes the checksum of whatever it is and
	// would still brick the machine. Running it first is what catches that.
	it('refuses a build that does not report the version that was asked for', async () => {
		await expect(apply({ binary: fakeBinary('9.9.9'), version: '2.1.0' })).rejects.toThrow(
			/reports "9.9.9", expected 2.1.0/
		);

		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.0.0');
		expect(fs.existsSync(`${binPath}.next`)).toBe(false);
	});

	// Nothing is touched until every check has passed, so a failed upgrade leaves
	// a machine exactly as it was rather than half-installed.
	it('writes no probation file when the upgrade is refused', async () => {
		await expect(
			apply({ binary: fakeBinary('2.1.0'), sums: `${'0'.repeat(64)}  ${ASSET}\n` })
		).rejects.toThrow();

		expect(fs.existsSync(path.join(home, '.bosun', 'upgrade-probation'))).toBe(false);
		expect(fs.existsSync(`${binPath}.previous`)).toBe(false);
	});

	it('rolls back to the replaced binary when the new one never connects', async () => {
		await apply({ binary: fakeBinary('2.1.0') });
		service().rollbackIfFailed('2.1.0');

		expect(service().rollbackIfFailed('2.1.0')).toBe('2.1.0');
		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.0.0');
		expect(service().blocked()).toEqual(['2.1.0']);
	});
});

describe('the first boot of a freshly installed build', () => {
	let home: string;
	let binPath: string;
	let release: { url: string; close: () => void } | null = null;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-boot-'));
		fs.mkdirSync(path.join(home, '.bosun'));
		binPath = path.join(home, 'bosun-agent');
		fs.writeFileSync(binPath, fakeBinary('2.0.0'), { mode: 0o755 });
	});

	afterEach(() => {
		release?.close();
		release = null;
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service() {
		return getUpgradeService({ exec: getExecService(), homeDir: home, execPath: binPath });
	}

	async function installNewBuild() {
		const binary = fakeBinary('2.1.0');

		release = await serve({ binary, sums: sumsFor(binary) });
		await service().apply({ version: '2.1.0', downloadBaseUrl: release.url });
	}

	// The probation file is written by the boot that installs, and read by the boot
	// that follows it. Treating its mere presence as failure rolls back before the
	// new build has run a single line, so no upgrade can ever stick.
	it('gets to run rather than being rolled back before it has tried', async () => {
		await installNewBuild();

		expect(service().rollbackIfFailed('2.1.0')).toBeNull();
		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.1.0');
		expect(service().blocked()).toEqual([]);
	});

	it('is kept once it connects', async () => {
		await installNewBuild();
		service().rollbackIfFailed('2.1.0');
		service().clearProbation();

		expect(service().rollbackIfFailed('2.1.0')).toBeNull();
		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.1.0');
	});

	// The second boot is the evidence: it means the first one started and died
	// without ever reaching a socket.
	it('is rolled back when a second boot finds it still unproven', async () => {
		await installNewBuild();
		service().rollbackIfFailed('2.1.0');

		expect(service().rollbackIfFailed('2.1.0')).toBe('2.1.0');
		expect(fs.readFileSync(binPath, 'utf8')).toContain('2.0.0');
		expect(service().blocked()).toEqual(['2.1.0']);
	});
});
