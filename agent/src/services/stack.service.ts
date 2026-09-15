import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_READY_TIMEOUT_SECONDS, type ProjectConfig } from '../project-config';
import { sleep } from '../utils';
import { scopedCommand, type MemoryService } from './memory.service';

const STACK_LOGS_DIRNAME = 'logs';

const PLACEHOLDER = /\{(port|url)(?:\.([^}]*))?\}/g;
const POLL_MS = 1_000;
const PROBE_TIMEOUT_MS = 3_000;
const NO_READY_GRACE_MS = 2_000;
const SIGKILL_GRACE_MS = 5_000;
const TAIL_LINES = 40;
const TAIL_CHARS = 4_000;
const TAIL_READ_BYTES = 64_000;

export interface StackApp {
	app: string;
	port: number;
	url: string;
	log: string;
}

export type StackUpResult =
	| { ok: true; apps: StackApp[] }
	| { ok: false; app: string; reason: string; logTail: string };

interface Running extends StackApp {
	child: ChildProcess;
	exit: { code: number | null; signal: NodeJS.Signals | null; error: string | null } | null;
	exited: Promise<void>;
}

function urlFor(port: number): string {
	return `http://127.0.0.1:${port}`;
}

// Position, not allocation: an app's port is its index in `apps`, so every
// machine, build and session computes the same number from the same file.
export function appPorts(config: ProjectConfig, portBase: number): Record<string, number> {
	return Object.fromEntries(Object.keys(config.apps).map((name, index) => [name, portBase + index]));
}

// A placeholder naming no app is left as written. Validation refuses those, so
// the only way to reach here with one is a config that skipped it — and a
// literal `{url.x}` in a failure is easier to trace than an empty string.
export function renderTemplate(value: string, opts: { app: string | null; ports: Record<string, number> }): string {
	return value.replace(PLACEHOLDER, (literal, kind: string, named?: string) => {
		const target = named ?? opts.app;
		const port = target === null ? undefined : opts.ports[target];

		if (port === undefined) {
			return literal;
		}

		return kind === 'port' ? String(port) : urlFor(port);
	});
}

// Dependencies first, and every dependency of a requested app is started even if
// it was not asked for: an app whose backend is missing is not an app that can
// answer its readiness check.
export function startOrder(config: ProjectConfig, apps?: string[]): string[] {
	const requested = apps ?? Object.keys(config.apps);
	const unknown = requested.find((name) => config.apps[name] === undefined);

	if (unknown !== undefined) {
		throw new Error(`no app named ${unknown} in apps`);
	}

	const order: string[] = [];
	const seen = new Set<string>();

	const visit = (name: string): void => {
		if (seen.has(name) || config.apps[name] === undefined) {
			return;
		}

		seen.add(name);

		for (const dependency of config.apps[name].dependsOn ?? []) {
			visit(dependency);
		}

		order.push(name);
	};

	for (const name of Object.keys(config.apps).filter((entry) => requested.includes(entry))) {
		visit(name);
	}

	return order;
}

export function logTail(file: string): string {
	try {
		const size = fs.statSync(file).size;
		const fd = fs.openSync(file, 'r');
		const length = Math.min(size, TAIL_READ_BYTES);
		const buffer = Buffer.alloc(length);

		try {
			fs.readSync(fd, buffer, 0, length, size - length);
		} finally {
			fs.closeSync(fd);
		}

		return buffer.toString('utf8').split('\n').slice(-TAIL_LINES).join('\n').slice(-TAIL_CHARS).trim();
	} catch {
		return '';
	}
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
	if (child.pid === undefined) {
		return;
	}

	try {
		process.kill(-child.pid, signal);
	} catch {
		// The group is already gone; nothing is left holding the port.
	}
}

// The group, not the leader: `sh -c "pnpm dev"` is a shell, a package manager and
// a server, and signalling only the first leaves the one holding the port.
// Signalled even after the leader exited, because its children can outlive it.
async function stop(running: Running): Promise<void> {
	signalGroup(running.child, 'SIGTERM');

	const killed = await Promise.race([
		running.exited.then(() => false),
		sleep(SIGKILL_GRACE_MS).then(() => true)
	]);

	signalGroup(running.child, 'SIGKILL');

	if (killed) {
		await Promise.race([running.exited, sleep(SIGKILL_GRACE_MS)]);
	}
}

function describeExit(exit: NonNullable<Running['exit']>): string {
	if (exit.error !== null) {
		return `could not start: ${exit.error}`;
	}

	return `exited before it was ready (${exit.signal === null ? `code ${exit.code ?? 'unknown'}` : exit.signal})`;
}

// A refused connection fails at once and is polled again. A connection that is
// accepted is left to answer until the deadline: a dev server compiles the whole
// app on its first request, and aborting that every few seconds is a server that
// is working and a probe that never lets it finish.
async function answers(url: string, timeoutMs: number): Promise<boolean> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(timeoutMs, PROBE_TIMEOUT_MS)), redirect: 'manual' });

		await response.body?.cancel();

		return response.status < 500;
	} catch {
		return false;
	}
}

// `{url.<app>}` is always 127.0.0.1, and a server bound to `localhost` can end up
// on ::1 alone — the one failure that looks like a hang but is an address.
async function answersOnlyOnIpv6(ready: string): Promise<boolean> {
	const url = new URL(ready);

	if (url.hostname !== '127.0.0.1') {
		return false;
	}

	url.hostname = '[::1]';

	return answers(url.toString(), PROBE_TIMEOUT_MS);
}

async function waitReady(opts: { running: Running; ready: string | null; timeoutSeconds: number }): Promise<string | null> {
	if (opts.ready === null) {
		await Promise.race([opts.running.exited, sleep(NO_READY_GRACE_MS)]);

		return opts.running.exit === null ? null : describeExit(opts.running.exit);
	}

	const deadline = Date.now() + opts.timeoutSeconds * 1000;

	for (;;) {
		if (opts.running.exit !== null) {
			return describeExit(opts.running.exit);
		}

		if (await answers(opts.ready, deadline - Date.now())) {
			return opts.running.exit === null ? null : describeExit(opts.running.exit);
		}

		if (Date.now() >= deadline) {
			return (await answersOnlyOnIpv6(opts.ready))
				? `answers on [::1] but not on ${opts.ready} — it is bound to localhost; start it on 127.0.0.1 (for Vite, --host 127.0.0.1)`
				: `did not answer ${opts.ready} within ${opts.timeoutSeconds}s`;
		}

		await Promise.race([opts.running.exited, sleep(POLL_MS)]);
	}
}

export function getStackService(deps: { memory: MemoryService; homeDir?: string }) {
	const logsRoot = path.join(deps.homeDir ?? os.homedir(), '.bosun', STACK_LOGS_DIRNAME);
	const stacks = new Map<string, Running[]>();

	function launch(opts: {
		key: string;
		app: string;
		command: string;
		cwd: string;
		env: NodeJS.ProcessEnv;
		log: string;
		port: number;
		memoryMaxBytes: number | null;
	}): Running {
		const scope = deps.memory.sessionScope({ runId: `${opts.key}-${opts.app}`, memoryMaxBytes: opts.memoryMaxBytes });
		const spec = scope === null
			? { command: 'sh', args: ['-c', opts.command] }
			: scopedCommand({ scope, command: 'sh', args: ['-c', opts.command] });

		fs.appendFileSync(opts.log, `--- starting ${opts.app} on port ${opts.port} at ${new Date().toISOString()} ---\n`);

		const fd = fs.openSync(opts.log, 'a');
		let child: ChildProcess;

		try {
			child = spawn(spec.command, spec.args, { cwd: opts.cwd, env: opts.env, detached: true, stdio: ['ignore', fd, fd] });
		} finally {
			fs.closeSync(fd);
		}

		const running: Running = {
			app: opts.app,
			port: opts.port,
			url: urlFor(opts.port),
			log: opts.log,
			child,
			exit: null,
			exited: Promise.resolve()
		};

		running.exited = new Promise<void>((resolve) => {
			child.once('exit', (code, signal) => {
				running.exit ??= { code, signal, error: null };
				resolve();
			});
			child.once('error', (error) => {
				running.exit ??= { code: null, signal: null, error: error.message };
				resolve();
			});
		});

		return running;
	}

	async function down(key: string): Promise<void> {
		const started = stacks.get(key);

		if (!started) {
			return;
		}

		stacks.delete(key);
		// Dependents first, so a frontend is not left logging a dead backend while it
		// waits its turn.
		await Promise.all([...started].reverse().map(stop));
	}

	async function fail(opts: { key: string; started: Running[]; app: string; reason: string; log: string }): Promise<StackUpResult> {
		if (stacks.get(opts.key) === opts.started) {
			await down(opts.key);
		} else {
			await Promise.all([...opts.started].reverse().map(stop));
		}

		return { ok: false, app: opts.app, reason: opts.reason, logTail: opts.log === '' ? '' : logTail(opts.log) };
	}

	return {
		logsRoot,

		async up(opts: {
			key: string;
			config: ProjectConfig;
			worktreePath: string;
			portBase: number;
			env: NodeJS.ProcessEnv;
			apps?: string[];
			memoryMaxBytes: number | null;
		}): Promise<StackUpResult> {
			await down(opts.key);

			let order: string[];

			try {
				order = startOrder(opts.config, opts.apps);
			} catch (error) {
				const unknown = (opts.apps ?? []).find((name) => opts.config.apps[name] === undefined) ?? '';

				return { ok: false, app: unknown, reason: error instanceof Error ? error.message : 'unknown app', logTail: '' };
			}

			const ports = appPorts(opts.config, opts.portBase);
			const logDir = path.join(logsRoot, opts.key);
			const started: Running[] = [];

			fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
			stacks.set(opts.key, started);

			for (const app of order) {
				const definition = opts.config.apps[app]!;
				const cwd = path.join(opts.worktreePath, definition.cwd ?? '.');
				const log = path.join(logDir, `${app}.log`);

				if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
					return fail({ key: opts.key, started, app, reason: `${definition.cwd ?? '.'} is not a directory in this tree`, log: '' });
				}

				const env = Object.fromEntries(
					Object.entries(definition.env ?? {}).map(([name, value]) => [name, renderTemplate(value, { app, ports })])
				);
				const running = launch({
					key: opts.key,
					app,
					command: renderTemplate(definition.start, { app, ports }),
					cwd,
					env: { ...opts.env, ...env },
					log,
					port: ports[app]!,
					memoryMaxBytes: opts.memoryMaxBytes
				});

				started.push(running);

				const reason = await waitReady({
					running,
					ready: definition.ready === undefined ? null : renderTemplate(definition.ready, { app, ports }),
					timeoutSeconds: definition.readyTimeoutSeconds ?? DEFAULT_READY_TIMEOUT_SECONDS
				});

				if (reason !== null) {
					return fail({ key: opts.key, started, app, reason, log });
				}
			}

			return { ok: true, apps: started.map(({ app, port, url, log }) => ({ app, port, url, log })) };
		},

		down,

		async downAll(): Promise<void> {
			await Promise.all([...stacks.keys()].map(down));
		},

		running(key: string): string[] {
			return (stacks.get(key) ?? []).map((entry) => entry.app);
		}
	};
}
