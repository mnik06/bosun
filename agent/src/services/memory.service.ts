import fs from 'fs';
import { type ExecService } from './exec.service';
import { type MachineMemory } from '../protocol';

const GIB = 1024 ** 3;

// Held back from every bullet: the kernel, the agent itself, a RAM-backed `/tmp`,
// and enough page cache that the box is not paging its own binaries. The backend
// budgets with the same number, and it lives in both packages for the same reason
// the protocol does — the agent needs it when a backend too old to send a limit
// dispatches a bullet anyway.
const RESERVED_BYTES = 1.5 * GIB;

// Every bullet's scope starts with this, so a restarted agent can find and stop
// what the process before it left running without knowing which runs those were.
const SCOPE_PREFIX = 'bosun-run-';

export interface SessionScope {
	unit: string;
	memoryMaxBytes: number;
}

export function formatGib(bytes: number): string {
	return `${(bytes / GIB).toFixed(1)} GB`;
}

export function parseMeminfo(raw: string): Omit<MachineMemory, 'sessionLimits'> | null {
	const kib = (key: string): number | null => {
		const match = new RegExp(`^${key}:\\s+(\\d+) kB$`, 'm').exec(raw);

		return match ? Number(match[1]) * 1024 : null;
	};
	const total = kib('MemTotal');
	const available = kib('MemAvailable');

	if (total === null || available === null) {
		return null;
	}

	return { totalBytes: total, availableBytes: available, swapTotalBytes: kib('SwapTotal') ?? 0 };
}

// Swap counts for half. It keeps a spike from becoming a kill, but a bullet that
// lives in it is a bullet that crawls, so it is not budgeted as though it were
// memory.
export function defaultSessionLimit(memory: { totalBytes: number; swapTotalBytes: number }): number {
	return Math.max(
		GIB,
		memory.totalBytes + Math.floor(memory.swapTotalBytes / 2) - RESERVED_BYTES
	);
}

// Run ids are already safe unit names. The replace is what keeps a future id
// format from producing an argument systemd refuses, which would read as a bullet
// that cannot start for no visible reason.
export function scopeUnitFor(runId: string): string {
	return `${SCOPE_PREFIX}${runId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

// `systemd-run --scope` registers the scope and then execs the command in the
// same process, so the pid the agent spawned is still `claude`'s and killing its
// process group still reaps everything the session started.
export function scopedCommand(opts: { scope: SessionScope; command: string; args: string[] }): {
	command: string;
	args: string[];
} {
	return {
		command: 'systemd-run',
		args: [
			'--user',
			'--scope',
			'--quiet',
			// Removed the moment its last process exits, failed or not. A killed bullet
			// otherwise leaves a failed unit behind under a name the retry needs.
			'--collect',
			`--unit=${opts.scope.unit}`,
			'-p',
			`MemoryMax=${opts.scope.memoryMaxBytes}`,
			// A scope's default is `stop`: the kernel kills one `eslint` for going over
			// the limit and systemd then tears down the `claude` that ran it. With
			// `continue` the command fails, the session sees it fail, and carries on.
			'-p',
			'OOMPolicy=continue',
			'--',
			opts.command,
			...opts.args
		]
	};
}

// `/proc/<pid>/cgroup` names the scope only once `systemd-run` has moved the
// process into it. Read before that, it names the agent's own unit — whose
// counter says nothing about this bullet — so anything but the scope is refused.
export function memoryEventsPath(opts: { cgroup: string; unit: string }): string | null {
	const path = opts.cgroup
		.split('\n')
		.find((line) => line.startsWith('0::'))
		?.slice(3)
		.trim();

	return path !== undefined && path.endsWith(`/${opts.unit}.scope`)
		? `/sys/fs/cgroup${path}/memory.events`
		: null;
}

export function parseOomKills(raw: string): number {
	return Number(/^oom_kill (\d+)$/m.exec(raw)?.[1] ?? 0);
}

export function unitFromCgroup(cgroup: string): string | null {
	const unit = cgroup
		.split('\n')
		.find((line) => line.startsWith('0::'))
		?.trim()
		.split('/')
		.at(-1);

	return unit !== undefined && unit.endsWith('.service') ? unit : null;
}

// systemd logs why a unit ended just before it starts the next process, so the
// previous process's result sits between the last two `Started` lines. Anything
// older belongs to a restart that has already been reported, and a restart with
// no `Failed` line — a `systemctl restart`, a first boot — has nothing to say.
export function previousExitResult(journal: string): string | null {
	const lines = journal.split('\n');
	const starts = lines.flatMap((line, index) => (/^Started \S+\.service\b/.test(line) ? [index] : []));
	const current = starts.at(-1);

	if (current === undefined) {
		return null;
	}

	const previous = starts.at(-2) ?? -1;

	for (let index = current - 1; index > previous; index -= 1) {
		const match = /Failed with result '([^']+)'/.exec(lines[index] ?? '');

		if (match) {
			return match[1] ?? null;
		}
	}

	return null;
}

export function getMemoryService(deps: {
	exec: ExecService;
	env: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	readFile?: (path: string) => string;
}) {
	const platform = deps.platform ?? process.platform;
	const readFile = deps.readFile ?? ((path: string) => fs.readFileSync(path, 'utf8'));
	let sessionLimits = false;
	let previousExit: string | null = null;

	function measure(): Omit<MachineMemory, 'sessionLimits'> | null {
		if (platform !== 'linux') {
			return null;
		}

		try {
			return parseMeminfo(readFile('/proc/meminfo'));
		} catch {
			return null;
		}
	}

	// Only meaningful under systemd, which sets `INVOCATION_ID` for the processes it
	// starts. A hand-run agent has no unit whose journal would describe it.
	async function readPreviousExit(): Promise<string | null> {
		if (!deps.env.INVOCATION_ID) {
			return null;
		}

		let unit: string | null;

		try {
			unit = unitFromCgroup(readFile('/proc/self/cgroup'));
		} catch {
			return null;
		}

		if (unit === null) {
			return null;
		}

		const journal = await deps.exec.run(
			'journalctl',
			['--user', '-u', unit, '-n', '200', '-o', 'cat', '--no-pager'],
			{ env: deps.env, timeoutMs: 10_000 }
		);

		return journal.ok ? previousExitResult(journal.stdout) : null;
	}

	return {
		// Probed rather than assumed: a container, a WSL box or an agent run by hand
		// in a shell without a user manager has `systemd-run` on the PATH and still
		// cannot create a scope. Finding that out on the first bullet would fail it.
		async load(): Promise<void> {
			if (platform !== 'linux') {
				return;
			}

			const probe = await deps.exec.run(
				'systemd-run',
				['--user', '--scope', '--quiet', '--collect', '-p', 'MemoryMax=64M', 'true'],
				{ env: deps.env, timeoutMs: 10_000 }
			);

			sessionLimits = probe.ok;

			if (!probe.ok) {
				console.error(
					`memory: bullets will run without a memory limit — systemd-run --user failed: ${probe.reason}`
				);
			}

			previousExit = await readPreviousExit();
		},

		// Read fresh every time: `availableBytes` is only worth sending if it is what
		// the machine has now.
		report(): MachineMemory | undefined {
			const memory = measure();

			return memory === null ? undefined : { ...memory, sessionLimits };
		},

		previousExit(): string | null {
			return previousExit;
		},

		// A scope lives outside the agent's unit, so the agent dying — the kernel,
		// a crash — does not take the sessions with it. Left alone, a `claude` from
		// the old process keeps writing to a worktree the backend is about to hand
		// the same bullet to again.
		async reapOrphans(): Promise<void> {
			if (!sessionLimits) {
				return;
			}

			const stopped = await deps.exec.run(
				'systemctl',
				['--user', 'stop', `${SCOPE_PREFIX}*.scope`],
				{ env: deps.env, timeoutMs: 30_000 }
			);

			if (!stopped.ok) {
				console.error(`memory: could not stop the sessions a previous agent left running: ${stopped.reason}`);
			}
		},

		sessionScope(opts: { runId: string; memoryMaxBytes: number | null }): SessionScope | null {
			if (!sessionLimits) {
				return null;
			}

			const memory = measure();
			const limit =
				opts.memoryMaxBytes ?? (memory === null ? null : defaultSessionLimit(memory));

			return limit === null ? null : { unit: scopeUnitFor(opts.runId), memoryMaxBytes: limit };
		}
	};
}

export type MemoryService = ReturnType<typeof getMemoryService>;
