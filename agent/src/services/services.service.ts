import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_SERVICE_READY_TIMEOUT_SECONDS, type ProjectConfig } from '../project-config';
import { runShell, type ShellResult } from './setup-steps.service';

const LEDGER_FILENAME = 'services.json';
const POLL_MS = 2_000;
const CHECK_TIMEOUT_MS = 60_000;
const START_TIMEOUT_MS = 15 * 60_000;
const STOP_TIMEOUT_MS = 2 * 60_000;
const TAIL_KEPT_CHARS = 1_500;

type RunShell = typeof runShell;

export type ServicesEnsure =
	| { ok: true }
	| { ok: false; service: string; reason: string; tail: string; detail: string };

// What teardown needs to stop a service once no config is reachable. PATH is kept
// because a stop command is often a package script that needs the provisioned
// toolchain; nothing else of the environment is, since it carries credentials.
interface LedgerEntry {
	name: string;
	worktreePath: string;
	cwd: string;
	stop: string;
}

interface Ledger {
	pathEnv: string | null;
	services: LedgerEntry[];
}

interface EnsureOpts {
	config: ProjectConfig;
	worktreePath: string;
	env: NodeJS.ProcessEnv;
}

type Failure = Extract<ServicesEnsure, { ok: false }>;

function failure(opts: { service: string; step: string; result: ShellResult }): Failure {
	const tail = opts.result.tail.trim().slice(-TAIL_KEPT_CHARS);
	const reason = `${opts.step} failed (${opts.result.detail})`;
	const detail = `service "${opts.service}" ${reason}${tail === '' ? '' : `:\n${tail}`}`;

	return { ok: false, service: opts.service, reason, tail, detail };
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function getServicesService(deps: { homeDir?: string; runShell?: RunShell; pollMs?: number }) {
	const ledgerPath = path.join(deps.homeDir ?? os.homedir(), '.bosun', LEDGER_FILENAME);
	const shell = deps.runShell ?? runShell;
	const pollMs = deps.pollMs ?? POLL_MS;
	// Every build on the machine shares one set of services. Two builds that both
	// found `supabase start` needed and ran it at once would fight over the same
	// containers, so each ensure waits for the one before it.
	let queue: Promise<unknown> = Promise.resolve();

	function readLedger(): Ledger {
		try {
			const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as Partial<Ledger>;

			return {
				pathEnv: typeof parsed.pathEnv === 'string' ? parsed.pathEnv : null,
				services: Array.isArray(parsed.services) ? parsed.services : []
			};
		} catch {
			return { pathEnv: null, services: [] };
		}
	}

	function record(opts: EnsureOpts): void {
		const services: LedgerEntry[] = Object.entries(opts.config.services).flatMap(([name, service]) =>
			service.stop === undefined ? [] : [{ name, worktreePath: opts.worktreePath, cwd: service.cwd ?? '.', stop: service.stop }]
		);
		const ledger: Ledger = { pathEnv: opts.env.PATH ?? null, services };

		try {
			fs.mkdirSync(path.dirname(ledgerPath), { recursive: true, mode: 0o700 });
			fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
		} catch (error) {
			console.error(`could not record the running services: ${errorText(error)}`);
		}
	}

	async function check(opts: { command: string; cwd: string; env: NodeJS.ProcessEnv }): Promise<ShellResult> {
		return shell({ ...opts, timeoutMs: CHECK_TIMEOUT_MS });
	}

	async function waitUntilUp(opts: { command: string; cwd: string; env: NodeJS.ProcessEnv; seconds: number }): Promise<ShellResult> {
		const deadline = Date.now() + opts.seconds * 1000;

		for (;;) {
			const checked = await check(opts);

			if (checked.ok) {
				return checked;
			}

			if (Date.now() >= deadline) {
				return { ...checked, detail: `still failing after ${opts.seconds}s, last ${checked.detail}` };
			}

			await new Promise((resolve) => setTimeout(resolve, pollMs));
		}
	}

	async function ensureOnce(opts: EnsureOpts): Promise<ServicesEnsure> {
		record(opts);

		for (const [name, service] of Object.entries(opts.config.services)) {
			const cwd = path.join(opts.worktreePath, service.cwd ?? '.');

			if ((await check({ command: service.check, cwd, env: opts.env })).ok) {
				continue;
			}

			console.log(`service ${name}: check failed, starting it`);

			const started = await shell({ command: service.start, cwd, env: opts.env, timeoutMs: START_TIMEOUT_MS });

			if (!started.ok) {
				return failure({ service: name, step: 'start', result: started });
			}

			const up = await waitUntilUp({
				command: service.check,
				cwd,
				env: opts.env,
				seconds: service.readyTimeoutSeconds ?? DEFAULT_SERVICE_READY_TIMEOUT_SECONDS
			});

			if (!up.ok) {
				return failure({ service: name, step: 'check', result: up });
			}
		}

		return { ok: true };
	}

	return {
		async ensure(opts: EnsureOpts): Promise<ServicesEnsure> {
			const run = queue.then(async () => ensureOnce(opts));

			queue = run.catch(() => undefined);

			return run;
		},

		// Best-effort, for a machine being removed: the last services an ensure saw,
		// in reverse order, each in the worktree it was ensured from or — when that
		// worktree is gone — the clone checkout.
		async stopAll(opts: { checkoutPath: string | null; env: NodeJS.ProcessEnv }): Promise<void> {
			const ledger = readLedger();
			const env = ledger.pathEnv === null ? opts.env : { ...opts.env, PATH: ledger.pathEnv };

			for (const entry of [...ledger.services].reverse()) {
				const root = fs.existsSync(entry.worktreePath) ? entry.worktreePath : opts.checkoutPath;

				if (root === null) {
					continue;
				}

				try {
					const cwd = path.join(root, entry.cwd);
					const stopped = await shell({ command: entry.stop, cwd, env, timeoutMs: STOP_TIMEOUT_MS });

					console.log(`service ${entry.name}: ${stopped.ok ? 'stopped' : `stop failed (${stopped.detail})`}`);
				} catch (error) {
					console.error(`service ${entry.name}: stop failed (${errorText(error)})`);
				}
			}
		}
	};
}

export type ServicesService = ReturnType<typeof getServicesService>;
