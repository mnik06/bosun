import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { type ExecService } from './exec.service';

// Not 0. `terminateSelf` exits 0 precisely so `Restart=on-failure` leaves a
// deleted machine down, and that is load-bearing. A distinct non-zero code gets
// the unit restarted onto the new binary without touching the unit file, which
// means agents already installed can upgrade without re-running install.sh.
export const UPGRADE_EXIT_CODE = 75;

const PROBATION_FILE = 'upgrade-probation';
const BLOCKED_FILE = 'upgrade-blocked';
const VERIFY_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export function assetNameFor(arch: string): string | null {
	if (arch === 'x64') {
		return 'bosun-agent-linux-x64';
	}

	if (arch === 'arm64') {
		return 'bosun-agent-linux-arm64';
	}

	return null;
}

// The same two shapes `install.sh` accepts, because the file it reads is the same
// file the release job publishes.
export function findChecksum(opts: { sums: string; asset: string }): string | null {
	for (const line of opts.sums.split('\n')) {
		const [hash, name] = line.trim().split(/\s+/);

		if (hash && name && (name === opts.asset || name === `*${opts.asset}`)) {
			return hash;
		}
	}

	return null;
}

export interface UpgradeDecision {
	proceed: boolean;
	reason: string;
}

export function decideUpgrade(opts: {
	current: string;
	target: string;
	blocked: string[];
	sessionsRunning: number;
	selfContained: boolean;
}): UpgradeDecision {
	if (!opts.selfContained) {
		return { proceed: false, reason: 'not a packaged binary — upgrade skipped' };
	}

	if (opts.current === opts.target) {
		return { proceed: false, reason: `already on ${opts.target}` };
	}

	// A version that came back broken once is not retried. Without this the
	// backend keeps offering it, the rollback keeps restoring the old binary, and
	// the machine flaps between the two for as long as anybody is watching.
	if (opts.blocked.includes(opts.target)) {
		return { proceed: false, reason: `${opts.target} previously failed to start — not retrying` };
	}

	// The binary is replaced and the process restarts, so a session in flight
	// would die with a question already on somebody's screen.
	if (opts.sessionsRunning > 0) {
		return { proceed: false, reason: `${opts.sessionsRunning} session(s) running — upgrade deferred` };
	}

	return { proceed: true, reason: `upgrading to ${opts.target}` };
}

function readLines(file: string): string[] {
	try {
		return fs
			.readFileSync(file, 'utf8')
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

export function getUpgradeService(deps: { exec: ExecService; homeDir?: string; execPath?: string }) {
	const home = deps.homeDir ?? os.homedir();
	const probationPath = path.join(home, '.bosun', PROBATION_FILE);
	const blockedPath = path.join(home, '.bosun', BLOCKED_FILE);
	const binPath = deps.execPath ?? process.execPath;
	const previousPath = `${binPath}.previous`;

	// Under `node dist/src/index.js` the running executable is node itself, and
	// replacing that would be catastrophic. Only a `bun build --compile` binary
	// names itself.
	const selfContained = path.basename(binPath).startsWith('bosun-agent');

	function blocked(): string[] {
		return readLines(blockedPath);
	}

	function block(version: string): void {
		const all = new Set([...blocked(), version]);

		fs.writeFileSync(blockedPath, `${[...all].join('\n')}\n`, { mode: 0o600 });
	}

	async function stage(opts: { version: string; downloadBaseUrl: string; asset: string }) {
		const base = opts.downloadBaseUrl.replace(/\/$/, '');
		const [binary, sums] = await Promise.all([
			fetch(`${base}/${opts.asset}`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }),
			fetch(`${base}/SHA256SUMS`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
		]);

		if (!binary.ok || !sums.ok) {
			throw new Error(`could not download ${opts.asset} from ${base}`);
		}

		const bytes = Buffer.from(await binary.arrayBuffer());
		const expected = findChecksum({ sums: await sums.text(), asset: opts.asset });

		if (!expected) {
			throw new Error(`no checksum published for ${opts.asset}`);
		}

		// Never optional. Without it, anyone who can tamper with the download base
		// gets arbitrary code execution on every machine that upgrades.
		const actual = crypto.createHash('sha256').update(bytes).digest('hex');

		if (actual !== expected) {
			throw new Error(`checksum mismatch for ${opts.asset} — refusing to install`);
		}

		const stagedPath = `${binPath}.next`;

		fs.writeFileSync(stagedPath, bytes, { mode: 0o755 });
		fs.chmodSync(stagedPath, 0o755);

		// Proves the download runs and is the build that was asked for, before it
		// becomes the binary this machine depends on to come back at all.
		const probe = await deps.exec.run(stagedPath, ['--version'], {
			timeoutMs: VERIFY_TIMEOUT_MS
		});

		if (!probe.ok || probe.stdout.trim() !== opts.version) {
			fs.rmSync(stagedPath, { force: true });

			throw new Error(
				`staged binary reports "${probe.stdout.trim() || probe.reason}", expected ${opts.version}`
			);
		}

		return stagedPath;
	}

	return {
		selfContained,
		binPath,

		blocked,

		decide(opts: { current: string; target: string; sessionsRunning: number }): UpgradeDecision {
			return decideUpgrade({ ...opts, blocked: blocked(), selfContained });
		},

		// Everything is verified before the live binary is touched; the swap itself
		// is a rename, which is atomic on one filesystem and safe to do to a running
		// executable on Linux because the running process keeps its inode.
		async apply(opts: { version: string; downloadBaseUrl: string }): Promise<void> {
			const asset = assetNameFor(process.arch);

			if (!asset) {
				throw new Error(`no agent build for ${process.arch}`);
			}

			const stagedPath = await stage({ ...opts, asset });

			fs.rmSync(previousPath, { force: true });
			fs.renameSync(binPath, previousPath);
			fs.renameSync(stagedPath, binPath);

			// Written last. Its presence on the next start means the previous boot
			// installed this version and never reached a working connection.
			fs.writeFileSync(probationPath, opts.version, { mode: 0o600 });
		},

		// Called once a connection is actually open, which is the only evidence
		// that matters: the new binary can reach bosun.
		clearProbation(): void {
			fs.rmSync(probationPath, { force: true });
		},

		// A machine has no inbound port, so a build that cannot connect cannot be
		// fixed from the browser. Restoring the previous binary is the only way back.
		rollbackIfFailed(currentVersion: string): string | null {
			const probation = readLines(probationPath)[0];

			if (probation !== currentVersion || !fs.existsSync(previousPath)) {
				return null;
			}

			fs.rmSync(probationPath, { force: true });
			block(currentVersion);
			fs.renameSync(previousPath, binPath);

			return currentVersion;
		}
	};
}

export type UpgradeService = ReturnType<typeof getUpgradeService>;
