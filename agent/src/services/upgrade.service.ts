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

// Long enough that a backend restart or a slow boot is not mistaken for a broken
// build — the reconnect backoff caps at 30s, so this is roughly ten attempts.
export const PROBATION_DEADLINE_MS = 300_000;

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
	// Whether asking again, harder, could get anywhere. A version this machine
	// already rolled back is the one refusal an operator can overrule; a session
	// mid-bullet is not, and neither is a binary that cannot replace itself.
	retryable: boolean;
}

export function decideUpgrade(opts: {
	current: string;
	target: string;
	blocked: string[];
	sessionsRunning: number;
	selfContained: boolean;
	force?: boolean;
}): UpgradeDecision {
	if (!opts.selfContained) {
		return {
			proceed: false,
			reason: 'not a packaged binary — upgrade skipped',
			retryable: false
		};
	}

	if (opts.current === opts.target) {
		return { proceed: false, reason: `already on ${opts.target}`, retryable: false };
	}

	// A version that came back broken once is not retried. Without this the
	// backend keeps offering it, the rollback keeps restoring the old binary, and
	// the machine flaps between the two for as long as anybody is watching.
	// Forcing clears exactly this one, because it is the only refusal that is a
	// judgement rather than a fact: the operator may know the build was fixed, or
	// that the failure was the machine rather than the release. Everything else
	// below stays refused however hard anybody asks.
	if (!opts.force && opts.blocked.includes(opts.target)) {
		return {
			proceed: false,
			reason: `${opts.target} was installed here before and failed to start, so it was rolled back`,
			retryable: true
		};
	}

	// The binary is replaced and the process restarts, so a session in flight
	// would die with a question already on somebody's screen.
	if (opts.sessionsRunning > 0) {
		return {
			proceed: false,
			reason: `${opts.sessionsRunning} session(s) running — the binary is replaced by a restart, which would kill them`,
			retryable: false
		};
	}

	return { proceed: true, reason: `upgrading to ${opts.target}`, retryable: false };
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

	function readProbation(): { version: string; boots: number } | null {
		const [version, boots] = readLines(probationPath);

		return version === undefined ? null : { version, boots: Number(boots) || 0 };
	}

	function writeProbation(opts: { version: string; boots: number }): void {
		fs.writeFileSync(probationPath, `${opts.version}\n${opts.boots}\n`, { mode: 0o600 });
	}

	function block(version: string): void {
		const all = new Set([...blocked(), version]);

		fs.writeFileSync(blockedPath, `${[...all].join('\n')}\n`, { mode: 0o600 });
	}

	// Cleared when an operator forces the version through, so a build that then
	// starts cleanly stops being refused. Without this the file is a one-way door
	// that only an ssh session can open.
	function unblock(version: string): void {
		const rest = blocked().filter((entry) => entry !== version);

		if (rest.length === 0) {
			fs.rmSync(blockedPath, { force: true });

			return;
		}

		fs.writeFileSync(blockedPath, `${rest.join('\n')}\n`, { mode: 0o600 });
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

		decide(opts: {
			current: string;
			target: string;
			sessionsRunning: number;
			force?: boolean;
		}): UpgradeDecision {
			return decideUpgrade({ ...opts, blocked: blocked(), selfContained });
		},

		unblock,

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

			// Written last, with no boots against it yet: the start that follows is
			// the new build's one chance to prove itself.
			writeProbation({ version: opts.version, boots: 0 });
		},

		// Called once a connection is actually open, which is the only evidence
		// that matters: the new binary can reach bosun.
		clearProbation(): void {
			fs.rmSync(probationPath, { force: true });
		},

		underProbation(): boolean {
			return readProbation() !== null;
		},

		// A machine has no inbound port, so a build that cannot connect cannot be
		// fixed from the browser. Restoring the previous binary is the only way back.
		//
		// The boot count is what separates "just installed" from "installed and
		// already failed once". Rolling back on the file's mere presence would fire
		// on the new build's very first start, before it has run a line, and no
		// upgrade could ever stick.
		rollbackIfFailed(currentVersion: string): string | null {
			const probation = readProbation();

			if (probation === null || probation.version !== currentVersion) {
				return null;
			}

			if (probation.boots === 0) {
				writeProbation({ version: currentVersion, boots: 1 });

				return null;
			}

			if (!fs.existsSync(previousPath)) {
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
