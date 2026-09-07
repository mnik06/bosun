import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const exec = promisify(execFile);

const UNIT = 'bosun-agent.service';
const SYSTEMCTL_TIMEOUT_MS = 10_000;

export interface RemovalFailure {
	target: string;
	what: string;
}

// Every removal is attempted even when an earlier one fails: a machine being torn
// down must not keep its credentials because its unit file was already gone.
function removeAll(targets: { path: string; what: string }[]): RemovalFailure[] {
	const failures: RemovalFailure[] = [];

	for (const target of targets) {
		try {
			fs.rmSync(target.path, { recursive: true, force: true });
		} catch {
			failures.push({ target: target.path, what: target.what });
		}
	}

	return failures;
}

// `~/.claude` is deliberately not here. That is Claude Code's own store, set up by
// the operator and useful without bosun; wiping it would take something we did not
// install. `loginctl enable-linger` is left alone for the same reason — other user
// services may depend on it.
export function agentFiles(opts: {
	homeDir: string;
	configPath: string;
	binPath: string | null;
}): { path: string; what: string }[] {
	return [
		{ path: path.join(opts.homeDir, '.config', 'systemd', 'user', UNIT), what: 'the systemd unit' },
		// Named separately from the directory below in case --config put it elsewhere.
		{ path: opts.configPath, what: 'the agent config' },
		// The machine key, the Claude credential and every MCP server's token.
		{ path: path.join(opts.homeDir, '.bosun'), what: 'the bosun directory' },
		...(opts.binPath === null
			? []
			: [
				{ path: `${opts.binPath}.previous`, what: 'the previous binary' },
				{ path: `${opts.binPath}.next`, what: 'a staged binary' },
				{ path: opts.binPath, what: 'the agent binary' }
			])
	];
}

export function getTeardownService(deps: { homeDir?: string; execPath?: string }) {
	const homeDir = deps.homeDir ?? os.homedir();
	const binPath = deps.execPath ?? process.execPath;
	// Under `node dist/src/index.js` the running executable is node. Deleting the
	// user's node install because a machine was removed in a browser is not a
	// tradeoff anyone would accept.
	const selfContained = path.basename(binPath).startsWith('bosun-agent');

	async function disableUnit(): Promise<boolean> {
		try {
			// `disable`, not `disable --now`: `--now` stops the unit this process is
			// running inside, racing the rest of the teardown. Exiting 0 under
			// Restart=on-failure is what stops it.
			await exec('systemctl', ['--user', 'disable', UNIT], { timeout: SYSTEMCTL_TIMEOUT_MS });

			return true;
		} catch {
			return false;
		}
	}

	async function reloadUnits(): Promise<void> {
		try {
			await exec('systemctl', ['--user', 'daemon-reload'], { timeout: SYSTEMCTL_TIMEOUT_MS });
		} catch {
			// Nothing to report: the unit file is already gone, and a stale unit in
			// systemd's memory disappears at the next boot regardless.
		}
	}

	return {
		selfContained,

		remove(configPath: string): RemovalFailure[] {
			return removeAll(
				agentFiles({ homeDir, configPath, binPath: selfContained ? binPath : null })
			);
		},

		// Bosun can only reach a machine through a socket the machine opened, so an
		// agent that has been revoked has to remove itself. Both callers — a
		// `shutdown` frame and a 401 on connect — mean the same thing: this machine
		// is gone from bosun and every credential it holds is now litter.
		async terminateSelf(opts: { configPath: string; reason: string }): Promise<never> {
			console.log(`removing bosun from this machine: ${opts.reason}`);

			if (!(await disableUnit())) {
				console.error(`could not disable ${UNIT} — remove the unit by hand if one exists`);
			}

			for (const failure of this.remove(opts.configPath)) {
				console.error(`could not remove ${failure.what} at ${failure.target} — delete it by hand`);
			}

			await reloadUnits();

			if (!selfContained) {
				console.log('left the agent binary in place: this process is not a packaged bosun-agent');
			}

			console.log('bosun removed. Re-enrolling needs terminal access to this machine.');
			process.exit(0);
		}
	};
}

export type TeardownService = ReturnType<typeof getTeardownService>;
