import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { type ExecService } from './exec.service';
import { type ProjectConfig } from '../project-config';

const SETUP_STATE_DIRNAME = 'setup-state';

const STEP_TIMEOUT_MS = 30 * 60 * 1000;
const TAIL_CHARS = 4_000;
const KILL_GRACE_MS = 5_000;

// The lockfiles whose change means a worktree's dependencies are stale. Only for
// a machine with no config: a config names exactly which files re-run which step.
const LOCKFILE_PATHSPECS = [
	'*pnpm-lock.yaml',
	'*package-lock.json',
	'*yarn.lock',
	'*bun.lock',
	'*bun.lockb',
	'*poetry.lock',
	'*uv.lock',
	'*Gemfile.lock',
	'*composer.lock',
	'*Cargo.lock',
	'*go.sum'
];

const LEGACY_STEP = 'setup command';

export interface ShellResult {
	ok: boolean;
	tail: string;
	detail: string;
}

// Streamed rather than buffered: an install prints megabytes, and a buffered
// child is killed for overflowing its buffer rather than for failing. Only the
// tail is kept, because the tail is where a failure says what it was.
export function runShell(opts: {
	command: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	timeoutMs?: number;
}): Promise<ShellResult> {
	return new Promise((resolve) => {
		let tail = '';
		let timedOut = false;
		const child = spawn('sh', ['-c', opts.command], {
			cwd: opts.cwd,
			env: opts.env,
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const keep = (chunk: Buffer) => {
			tail = `${tail}${chunk.toString('utf8')}`.slice(-TAIL_CHARS);
		};
		const signal = (name: NodeJS.Signals) => {
			try {
				process.kill(-child.pid!, name);
			} catch {
				child.kill(name);
			}
		};
		const timer = setTimeout(() => {
			timedOut = true;
			signal('SIGTERM');
			setTimeout(() => signal('SIGKILL'), KILL_GRACE_MS).unref();
		}, opts.timeoutMs ?? STEP_TIMEOUT_MS);

		child.stdout.on('data', keep);
		child.stderr.on('data', keep);
		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ ok: false, tail, detail: error.message });
		});
		child.on('close', (code, closedBy) => {
			clearTimeout(timer);

			if (code === 0) {
				resolve({ ok: true, tail, detail: 'done' });

				return;
			}

			const detail = timedOut
				? `timed out after ${Math.round((opts.timeoutMs ?? STEP_TIMEOUT_MS) / 60_000)} minutes`
				: `exited with ${code ?? closedBy ?? 'an unknown status'}`;

			resolve({ ok: false, tail, detail });
		});
	});
}

// A missing file hashes as absent, so a lockfile added later counts as a change.
export function hashFiles(opts: { root: string; files: string[] }): string {
	const hash = crypto.createHash('sha256');

	for (const file of [...opts.files].sort()) {
		hash.update(file).update('\0');

		try {
			hash.update(fs.readFileSync(path.join(opts.root, file)));
		} catch {
			hash.update('\0absent\0');
		}

		hash.update('\0');
	}

	return hash.digest('hex');
}

export function failureMessage(opts: { step: string; result: ShellResult }): string {
	const tail = opts.result.tail.trim();

	return `setup step "${opts.step}" failed (${opts.result.detail})${tail === '' ? '' : `:\n${tail}`}`;
}

type SetupFailure = { ok: false; step: string; message: string };

export function getSetupStepsService(deps: { exec: ExecService; homeDir?: string }) {
	const stateDir = path.join(deps.homeDir ?? os.homedir(), '.bosun', SETUP_STATE_DIRNAME);

	function statePath(key: string): string {
		return path.join(stateDir, `${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
	}

	function readState(key: string): Record<string, string> {
		try {
			const parsed: unknown = JSON.parse(fs.readFileSync(statePath(key), 'utf8'));

			return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
		} catch {
			return {};
		}
	}

	function writeState(key: string, state: Record<string, string>): void {
		fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
		fs.writeFileSync(statePath(key), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
	}

	async function lockfiles(worktreePath: string): Promise<string[]> {
		const listed = await deps.exec.run('git', ['-C', worktreePath, 'ls-files', '-z', '--', ...LOCKFILE_PATHSPECS], {
			timeoutMs: 30_000
		});

		return listed.ok ? listed.stdout.split('\0').filter(Boolean) : [];
	}

	async function runSteps(opts: {
		key: string;
		worktreePath: string;
		config: ProjectConfig;
		env: NodeJS.ProcessEnv;
		onlyChanged: boolean;
		onStep?: (name: string) => void;
	}): Promise<{ ok: true; ran: string[] } | SetupFailure> {
		const state = readState(opts.key);
		const ran: string[] = [];

		for (const step of opts.config.setup) {
			const hash = step.rerunWhen === undefined ? null : hashFiles({ root: opts.worktreePath, files: step.rerunWhen });

			if (opts.onlyChanged && (hash === null || state[step.name] === hash)) {
				continue;
			}

			opts.onStep?.(step.name);

			const result = await runShell({
				command: step.run,
				cwd: path.join(opts.worktreePath, step.cwd ?? '.'),
				env: opts.env
			});

			if (!result.ok) {
				// Forgotten rather than left at the old hash, so the next bullet tries the
				// step again instead of trusting the half-installed tree it left behind.
				delete state[step.name];
				writeState(opts.key, state);

				return { ok: false, step: step.name, message: failureMessage({ step: step.name, result }) };
			}

			if (hash !== null) {
				state[step.name] = hash;
				writeState(opts.key, state);
			}

			ran.push(step.name);
		}

		return { ok: true, ran };
	}

	return {
		// Every step, in order, when a worktree is created.
		async runAll(opts: {
			key: string;
			worktreePath: string;
			config: ProjectConfig;
			env: NodeJS.ProcessEnv;
			onStep?: (name: string) => void;
		}) {
			return runSteps({ ...opts, onlyChanged: false });
		},

		// Before every bullet: only the steps whose `rerunWhen` files changed since they
		// last ran. A worktree otherwise keeps the dependencies it was created with for
		// every plan that follows, however many of them changed the lockfile.
		async rerunChanged(opts: {
			key: string;
			worktreePath: string;
			config: ProjectConfig;
			env: NodeJS.ProcessEnv;
			onStep?: (name: string) => void;
		}) {
			return runSteps({ ...opts, onlyChanged: true });
		},

		// The same idea for a machine with no config: its one setup command re-runs
		// when any tracked lockfile changed.
		async runLegacy(opts: {
			key: string;
			worktreePath: string;
			command: string;
			env: NodeJS.ProcessEnv;
			onlyChanged: boolean;
		}): Promise<{ ok: true; ran: boolean } | SetupFailure> {
			const files = await lockfiles(opts.worktreePath);
			const hash = hashFiles({ root: opts.worktreePath, files });
			const state = readState(opts.key);

			if (opts.onlyChanged && state[LEGACY_STEP] === hash) {
				return { ok: true, ran: false };
			}

			const result = await runShell({ command: opts.command, cwd: opts.worktreePath, env: opts.env });

			if (!result.ok) {
				delete state[LEGACY_STEP];
				writeState(opts.key, state);

				return { ok: false, step: LEGACY_STEP, message: failureMessage({ step: LEGACY_STEP, result }) };
			}

			writeState(opts.key, { ...state, [LEGACY_STEP]: hash });

			return { ok: true, ran: true };
		},

		forget(key: string): void {
			fs.rmSync(statePath(key), { force: true });
		}
	};
}
