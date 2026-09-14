import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { type ExecService } from './exec.service';

export const TOOLCHAINS_DIRNAME = 'toolchains';

const DOWNLOAD_TIMEOUT_MS = 300_000;
const EXTRACT_TIMEOUT_MS = 300_000;
const NODE_VERSION = /^\d+\.\d+\.\d+$/;
const PACKAGE_MANAGER = /^(npm|pnpm|yarn)@(\d+\.\d+\.\d+)$/;
const BIN_NAME = /^[A-Za-z0-9._-]+$/;

export type ToolchainResult =
	| { ok: true; binDirs: string[]; detail: string }
	| { ok: false; detail: string };

// Thrown only with a message fit for a failure reason. Anything else that escapes
// is reported by its message too, never its stack: the detail reaches the browser.
class ToolchainError extends Error {}

export function withToolchainPath(env: NodeJS.ProcessEnv, binDirs: string[]): NodeJS.ProcessEnv {
	const rest = (env.PATH ?? '').split(':').filter((entry) => entry !== '' && !binDirs.includes(entry));

	return { ...env, PATH: [...new Set(binDirs), ...rest].join(':') };
}

export function findShasum(opts: { sums: string; file: string }): string | null {
	for (const line of opts.sums.split('\n')) {
		const [hash, name] = line.trim().split(/\s+/);

		if (hash && name === opts.file) {
			return hash.toLowerCase();
		}
	}

	return null;
}

// npm's `dist.integrity` is SRI: space-separated `<algo>-<base64>` entries. Only
// sha512 is accepted — an entry list with nothing stronger is a refusal, not a
// weaker check.
export function integrityMatches(opts: { integrity: string; bytes: Buffer }): boolean {
	const expected = opts.integrity
		.split(/\s+/)
		.filter((entry) => entry.startsWith('sha512-'))
		.map((entry) => entry.slice('sha512-'.length));

	if (expected.length === 0) {
		return false;
	}

	const actual = crypto.createHash('sha512').update(opts.bytes).digest('base64');

	return expected.includes(actual);
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

export function shimScript(opts: { nodeBin: string; target: string }): string {
	return `#!/bin/sh\nexec ${shellQuote(path.join(opts.nodeBin, 'node'))} ${shellQuote(opts.target)} "$@"\n`;
}

// A path in `bin` that climbs out of the package would make the shim run a file
// the checksum never covered.
export function binEntries(pkg: { name?: unknown; bin?: unknown }): [string, string][] {
	const unscoped = typeof pkg.name === 'string' ? (pkg.name.split('/').pop() ?? '') : '';
	const raw: [string, unknown][] =
		typeof pkg.bin === 'string'
			? [[unscoped, pkg.bin]]
			: Object.entries(pkg.bin !== null && typeof pkg.bin === 'object' ? pkg.bin : {});

	return raw.flatMap(([name, target]) => {
		if (!BIN_NAME.test(name) || typeof target !== 'string') {
			return [];
		}

		const normalized = path.posix.normalize(target.replace(/^\.\//, ''));

		return normalized.startsWith('..') || path.posix.isAbsolute(normalized) ? [] : [[name, normalized]];
	});
}

function nodeTarget(opts: { platform: NodeJS.Platform; arch: string }): string | null {
	const platform = opts.platform === 'linux' || opts.platform === 'darwin' ? opts.platform : null;
	const arch = opts.arch === 'x64' || opts.arch === 'arm64' ? opts.arch : null;

	return platform === null || arch === null ? null : `${platform}-${arch}`;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function getToolchainService(deps: {
	exec: ExecService;
	homeDir?: string;
	arch?: string;
	platform?: NodeJS.Platform;
	fetchImpl?: typeof fetch;
	nodeDist?: string;
	registry?: string;
}) {
	const root = path.join(deps.homeDir ?? os.homedir(), '.bosun', TOOLCHAINS_DIRNAME);
	const fetchImpl = deps.fetchImpl ?? fetch;
	const nodeDist = (deps.nodeDist ?? 'https://nodejs.org/dist').replace(/\/$/, '');
	const registry = (deps.registry ?? 'https://registry.npmjs.org').replace(/\/$/, '');
	const target = nodeTarget({ platform: deps.platform ?? process.platform, arch: deps.arch ?? process.arch });
	// Two bullets starting at once ask for the same node. One download, one
	// extraction and one rename serve both, rather than two racing into one path.
	const inFlight = new Map<string, Promise<string>>();

	function shared(key: string, work: () => Promise<string>): Promise<string> {
		const existing = inFlight.get(key);

		if (existing) {
			return existing;
		}

		const promise = work().finally(() => {
			inFlight.delete(key);
		});

		inFlight.set(key, promise);

		return promise;
	}

	async function download(url: string): Promise<Buffer> {
		let response: Response;

		try {
			response = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
		} catch (error) {
			throw new ToolchainError(`could not download ${url}: ${messageOf(error)}`);
		}

		if (!response.ok) {
			throw new ToolchainError(`could not download ${url}: HTTP ${response.status}`);
		}

		return Buffer.from(await response.arrayBuffer());
	}

	async function extract(opts: { archive: Buffer; into: string; strip: boolean; what: string }): Promise<void> {
		const file = path.join(opts.into, '..', `${path.basename(opts.into)}.tgz`);

		fs.writeFileSync(file, opts.archive);
		fs.mkdirSync(opts.into, { recursive: true });

		try {
			const result = await deps.exec.run(
				'tar',
				['-xzf', file, '-C', opts.into, ...(opts.strip ? ['--strip-components=1'] : [])],
				{ timeoutMs: EXTRACT_TIMEOUT_MS }
			);

			if (!result.ok) {
				throw new ToolchainError(`could not extract ${opts.what}: ${result.reason}`);
			}
		} finally {
			fs.rmSync(file, { force: true });
		}
	}

	// Extracted beside the target and renamed into place, so a crash mid-extract
	// leaves a temp directory rather than a half-unpacked toolchain that looks
	// present and fails on its first command.
	function install(opts: { staged: string; final: string; usable: () => Promise<boolean> }) {
		return async (): Promise<void> => {
			fs.rmSync(opts.final, { recursive: true, force: true });

			try {
				fs.renameSync(opts.staged, opts.final);
			} catch (error) {
				fs.rmSync(opts.staged, { recursive: true, force: true });

				if (!(await opts.usable())) {
					throw new ToolchainError(`could not move ${path.basename(opts.final)} into place: ${messageOf(error)}`);
				}
			}
		};
	}

	async function nodeUsable(opts: { dir: string; version: string }): Promise<boolean> {
		if (!fs.existsSync(path.join(opts.dir, 'bin', 'node'))) {
			return false;
		}

		const probe = await deps.exec.run(path.join(opts.dir, 'bin', 'node'), ['--version'], { timeoutMs: 10_000 });

		return probe.ok && probe.stdout.trim() === `v${opts.version}`;
	}

	async function ensureNode(version: string): Promise<string> {
		const dir = path.join(root, `node-${version}`);

		if (await nodeUsable({ dir, version })) {
			return dir;
		}

		if (target === null) {
			throw new ToolchainError(`no node build for ${deps.platform ?? process.platform}-${deps.arch ?? process.arch}`);
		}

		const file = `node-v${version}-${target}.tar.gz`;
		const base = `${nodeDist}/v${version}`;
		const [archive, sums] = await Promise.all([download(`${base}/${file}`), download(`${base}/SHASUMS256.txt`)]);
		const expected = findShasum({ sums: sums.toString('utf8'), file });

		if (expected === null) {
			throw new ToolchainError(`no checksum published for ${file}`);
		}

		// Never optional: an unverified tarball is arbitrary code run by every
		// session, setup step and app on this machine.
		if (crypto.createHash('sha256').update(archive).digest('hex') !== expected) {
			throw new ToolchainError(`checksum mismatch for ${file} — refusing to install it`);
		}

		fs.mkdirSync(root, { recursive: true, mode: 0o700 });

		const staged = fs.mkdtempSync(path.join(root, `.tmp-node-${version}-`));

		try {
			await extract({ archive, into: path.join(staged, 'node'), strip: true, what: file });
			await install({
				staged: path.join(staged, 'node'),
				final: dir,
				usable: async () => nodeUsable({ dir, version })
			})();
		} finally {
			fs.rmSync(staged, { recursive: true, force: true });
		}

		return dir;
	}

	function installedVersion(dir: string): string | null {
		try {
			const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package', 'package.json'), 'utf8')) as { version?: unknown };

			return typeof pkg.version === 'string' ? pkg.version : null;
		} catch {
			return null;
		}
	}

	async function ensurePackage(opts: { name: string; version: string }): Promise<string> {
		const dir = path.join(root, `${opts.name}-${opts.version}`);

		if (installedVersion(dir) === opts.version) {
			return dir;
		}

		const metadataUrl = `${registry}/${opts.name}/${opts.version}`;
		let metadata: { dist?: { tarball?: unknown; integrity?: unknown } };

		try {
			metadata = JSON.parse((await download(metadataUrl)).toString('utf8')) as typeof metadata;
		} catch (error) {
			throw error instanceof ToolchainError ? error : new ToolchainError(`${metadataUrl} is not package metadata`);
		}

		const tarball = metadata.dist?.tarball;
		const integrity = metadata.dist?.integrity;

		if (typeof tarball !== 'string' || typeof integrity !== 'string') {
			throw new ToolchainError(`${opts.name}@${opts.version} publishes no tarball with an integrity hash`);
		}

		const archive = await download(tarball);

		if (!integrityMatches({ integrity, bytes: archive })) {
			throw new ToolchainError(`integrity mismatch for ${opts.name}@${opts.version} — refusing to install it`);
		}

		fs.mkdirSync(root, { recursive: true, mode: 0o700 });

		const staged = fs.mkdtempSync(path.join(root, `.tmp-${opts.name}-${opts.version}-`));

		try {
			await extract({ archive, into: path.join(staged, 'pm'), strip: false, what: `${opts.name}@${opts.version}` });
			await install({
				staged: path.join(staged, 'pm'),
				final: dir,
				usable: async () => installedVersion(dir) === opts.version
			})();
		} finally {
			fs.rmSync(staged, { recursive: true, force: true });
		}

		return dir;
	}

	// Rewritten whenever it differs rather than once: the shim names the node it
	// runs under, and a config that moves to a new node keeps its package manager.
	function writeShims(opts: { pmDir: string; nodeDir: string; spec: string }): string {
		const pkgDir = path.join(opts.pmDir, 'package');
		let pkg: { name?: unknown; bin?: unknown };

		try {
			pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as typeof pkg;
		} catch {
			throw new ToolchainError(`${opts.spec} has no readable package.json`);
		}

		const entries = binEntries(pkg);

		if (entries.length === 0) {
			throw new ToolchainError(`${opts.spec} declares no executable`);
		}

		const binDir = path.join(opts.pmDir, 'bin');

		fs.mkdirSync(binDir, { recursive: true });

		for (const [name, relative] of entries) {
			const shim = path.join(binDir, name);
			const script = shimScript({ nodeBin: path.join(opts.nodeDir, 'bin'), target: path.join(pkgDir, relative) });
			const current = fs.existsSync(shim) ? fs.readFileSync(shim, 'utf8') : null;

			if (current !== script) {
				fs.writeFileSync(shim, script, { mode: 0o755 });
			}

			fs.chmodSync(shim, 0o755);
		}

		return binDir;
	}

	return {
		root,

		async ensure(opts: { node: string; packageManager?: string }): Promise<ToolchainResult> {
			if (!NODE_VERSION.test(opts.node)) {
				return { ok: false, detail: `node ${opts.node} is not an exact version` };
			}

			const manager = opts.packageManager === undefined ? null : PACKAGE_MANAGER.exec(opts.packageManager);

			if (opts.packageManager !== undefined && manager === null) {
				return { ok: false, detail: `${opts.packageManager} is not npm, pnpm or yarn at an exact version` };
			}

			try {
				const nodeDir = await shared(`node@${opts.node}`, async () => ensureNode(opts.node));
				const binDirs = [path.join(nodeDir, 'bin')];

				if (manager !== null) {
					const [, name, version] = manager as unknown as [string, string, string];
					const pmDir = await shared(`${name}@${version}`, async () => ensurePackage({ name, version }));

					// Ahead of node's own bin, which ships an npm: behind it, a config naming
					// `npm@11` would run whichever npm that node happened to bundle.
					binDirs.unshift(writeShims({ pmDir, nodeDir, spec: `${name}@${version}` }));
				}

				return {
					ok: true,
					binDirs,
					detail: `node ${opts.node}${opts.packageManager === undefined ? '' : `, ${opts.packageManager}`}`
				};
			} catch (error) {
				return { ok: false, detail: messageOf(error) };
			}
		}
	};
}

export type ToolchainService = ReturnType<typeof getToolchainService>;
