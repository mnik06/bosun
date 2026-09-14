import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { getExecService } from './exec.service';
import {
	binEntries,
	findShasum,
	getToolchainService,
	integrityMatches,
	shimScript,
	withToolchainPath
} from './toolchain.service';

const temps: string[] = [];

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-toolchain-'));

	temps.push(dir);

	return dir;
}

afterEach(() => {
	for (const dir of temps.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function tarGz(opts: { files: Record<string, { content: string; mode?: number }>; top: string }): Buffer {
	const work = tempDir();

	for (const [relative, file] of Object.entries(opts.files)) {
		const target = path.join(work, opts.top, relative);

		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, file.content, { mode: file.mode ?? 0o644 });
	}

	const out = path.join(work, 'out.tgz');

	// macOS tar otherwise adds AppleDouble `._` entries beside every file.
	execFileSync('tar', ['-czf', out, '-C', work, opts.top], { env: { ...process.env, COPYFILE_DISABLE: '1' } });

	return fs.readFileSync(out);
}

function sha256(bytes: Buffer): string {
	return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fakeFetch(routes: Record<string, Buffer | string>): typeof fetch {
	return (async (input: string | URL | Request) => {
		const body = routes[String(input)];

		return body === undefined
			? new Response('missing', { status: 404 })
			: new Response(typeof body === 'string' ? body : new Uint8Array(body));
	}) as typeof fetch;
}

const NODE_VERSION = '1.2.3';
const NODE_FILE = `node-v${NODE_VERSION}-linux-x64.tar.gz`;
const NODE_ARCHIVE = tarGz({
	top: `node-v${NODE_VERSION}-linux-x64`,
	files: { 'bin/node': { content: `#!/bin/sh\necho v${NODE_VERSION}\n`, mode: 0o755 } }
});

function service(opts: { routes: Record<string, Buffer | string>; homeDir: string }) {
	return getToolchainService({
		exec: getExecService(),
		homeDir: opts.homeDir,
		platform: 'linux',
		arch: 'x64',
		nodeDist: 'https://dist.test',
		registry: 'https://registry.test',
		fetchImpl: fakeFetch(opts.routes)
	});
}

describe('withToolchainPath', () => {
	it('puts the toolchain first and does not repeat a directory already on PATH', () => {
		const env = withToolchainPath({ PATH: '/usr/bin:/t/node/bin:/bin', HOME: '/h' }, ['/t/node/bin', '/t/pnpm/bin']);

		expect(env.PATH).toBe('/t/node/bin:/t/pnpm/bin:/usr/bin:/bin');
		expect(env.HOME).toBe('/h');
	});
});

describe('checksums', () => {
	it('finds the line for exactly the file asked for', () => {
		const sums = `aaa  node-v1.2.3-linux-x64.tar.gz.sig\nBBB  node-v1.2.3-linux-x64.tar.gz\n`;

		expect(findShasum({ sums, file: 'node-v1.2.3-linux-x64.tar.gz' })).toBe('bbb');
		expect(findShasum({ sums, file: 'node-v1.2.3-darwin-x64.tar.gz' })).toBeNull();
	});

	it('accepts a matching sha512 among several SRI entries and refuses anything weaker', () => {
		const bytes = Buffer.from('tarball');
		const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
		const sha1 = crypto.createHash('sha1').update(bytes).digest('base64');

		expect(integrityMatches({ integrity: `sha1-${sha1} sha512-${sha512}`, bytes })).toBe(true);
		expect(integrityMatches({ integrity: `sha1-${sha1}`, bytes })).toBe(false);
		expect(integrityMatches({ integrity: `sha512-${sha512}`, bytes: Buffer.from('other') })).toBe(false);
	});
});

describe('binEntries', () => {
	it('reads both shapes of bin and drops a path that leaves the package', () => {
		expect(binEntries({ name: '@scope/tool', bin: './cli.js' })).toEqual([['tool', 'cli.js']]);
		expect(binEntries({ name: 'pnpm', bin: { pnpm: 'bin/pnpm.cjs', evil: '../../x', 'bad name': 'y' } })).toEqual([
			['pnpm', 'bin/pnpm.cjs']
		]);
	});

	it('writes a shim that runs the target under the named node, quoted', () => {
		expect(shimScript({ nodeBin: "/h/it's/node/bin", target: '/p/bin/pnpm.cjs' })).toBe(
			"#!/bin/sh\nexec '/h/it'\\''s/node/bin/node' '/p/bin/pnpm.cjs' \"$@\"\n"
		);
	});
});

describe('ensure', () => {
	it('installs a verified node, then reuses it without downloading again', async () => {
		const homeDir = tempDir();
		const routes = {
			[`https://dist.test/v${NODE_VERSION}/${NODE_FILE}`]: NODE_ARCHIVE,
			[`https://dist.test/v${NODE_VERSION}/SHASUMS256.txt`]: `${sha256(NODE_ARCHIVE)}  ${NODE_FILE}\n`
		};
		const first = await service({ routes, homeDir }).ensure({ node: NODE_VERSION });
		const second = await service({ routes: {}, homeDir }).ensure({ node: NODE_VERSION });
		const nodeBin = path.join(homeDir, '.bosun', 'toolchains', `node-${NODE_VERSION}`, 'bin');

		expect(first).toEqual({ ok: true, binDirs: [nodeBin], detail: `node ${NODE_VERSION}` });
		expect(second).toEqual(first);
		expect(fs.readdirSync(path.join(homeDir, '.bosun', 'toolchains'))).toEqual([`node-${NODE_VERSION}`]);
	});

	it('refuses a node whose checksum does not match and leaves nothing installed', async () => {
		const homeDir = tempDir();
		const result = await service({
			homeDir,
			routes: {
				[`https://dist.test/v${NODE_VERSION}/${NODE_FILE}`]: NODE_ARCHIVE,
				[`https://dist.test/v${NODE_VERSION}/SHASUMS256.txt`]: `${'0'.repeat(64)}  ${NODE_FILE}\n`
			}
		}).ensure({ node: NODE_VERSION });

		expect(result).toEqual({ ok: false, detail: expect.stringContaining('checksum mismatch') });
		expect(fs.existsSync(path.join(homeDir, '.bosun', 'toolchains', `node-${NODE_VERSION}`))).toBe(false);
	});

	it('installs a package manager verified by integrity, with a runnable shim', async () => {
		const homeDir = tempDir();
		const pm = tarGz({
			top: 'package',
			files: {
				'package.json': { content: JSON.stringify({ name: 'pnpm', version: '9.1.0', bin: { pnpm: 'bin/pnpm.cjs' } }) },
				'bin/pnpm.cjs': { content: 'console.log("pnpm")' }
			}
		});
		const integrity = `sha512-${crypto.createHash('sha512').update(pm).digest('base64')}`;
		const routes = {
			[`https://dist.test/v${NODE_VERSION}/${NODE_FILE}`]: NODE_ARCHIVE,
			[`https://dist.test/v${NODE_VERSION}/SHASUMS256.txt`]: `${sha256(NODE_ARCHIVE)}  ${NODE_FILE}\n`,
			'https://registry.test/pnpm/9.1.0': JSON.stringify({ dist: { tarball: 'https://registry.test/pnpm.tgz', integrity } }),
			'https://registry.test/pnpm.tgz': pm
		};
		const result = await service({ routes, homeDir }).ensure({ node: NODE_VERSION, packageManager: 'pnpm@9.1.0' });
		const root = path.join(homeDir, '.bosun', 'toolchains');
		const shim = path.join(root, 'pnpm-9.1.0', 'bin', 'pnpm');

		expect(result).toEqual({
			ok: true,
			binDirs: [path.join(root, 'pnpm-9.1.0', 'bin'), path.join(root, `node-${NODE_VERSION}`, 'bin')],
			detail: `node ${NODE_VERSION}, pnpm@9.1.0`
		});
		expect(fs.readFileSync(shim, 'utf8')).toBe(
			shimScript({
				nodeBin: path.join(root, `node-${NODE_VERSION}`, 'bin'),
				target: path.join(root, 'pnpm-9.1.0', 'package', 'bin', 'pnpm.cjs')
			})
		);
		expect(fs.statSync(shim).mode & 0o111).not.toBe(0);
	});

	it('refuses a package manager whose tarball does not match its integrity', async () => {
		const homeDir = tempDir();
		const routes = {
			[`https://dist.test/v${NODE_VERSION}/${NODE_FILE}`]: NODE_ARCHIVE,
			[`https://dist.test/v${NODE_VERSION}/SHASUMS256.txt`]: `${sha256(NODE_ARCHIVE)}  ${NODE_FILE}\n`,
			'https://registry.test/pnpm/9.1.0': JSON.stringify({
				dist: { tarball: 'https://registry.test/pnpm.tgz', integrity: `sha512-${Buffer.from('nope').toString('base64')}` }
			}),
			'https://registry.test/pnpm.tgz': Buffer.from('tampered')
		};
		const result = await service({ routes, homeDir }).ensure({ node: NODE_VERSION, packageManager: 'pnpm@9.1.0' });

		expect(result).toEqual({ ok: false, detail: expect.stringContaining('integrity mismatch') });
		expect(fs.existsSync(path.join(homeDir, '.bosun', 'toolchains', 'pnpm-9.1.0'))).toBe(false);
	});

	it('names the download that failed', async () => {
		const result = await service({ routes: {}, homeDir: tempDir() }).ensure({ node: NODE_VERSION });

		expect(result).toEqual({ ok: false, detail: expect.stringMatching(/could not download https:\/\/dist\.test\/.* HTTP 404/) });
	});
});
