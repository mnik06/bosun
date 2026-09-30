import path from 'path';
import { type ProjectConfig } from '../project-config';
import { inFolder, inferRegenerate, inferRerunWhen, isDirectory, packageScripts, readText } from './config-inference-steps';

// A config is written the way a person would write it — `Start: pnpm dev`, no
// ports, no env wiring, no readiness URL — and this file fills in the rest from
// the tree it is about to run in. Anything the config does say wins: an inferred
// value only ever fills a field that was left out.

type App = ProjectConfig['apps'][string];
type ServerKind = 'vite' | 'next' | 'other';

interface AppFacts {
	name: string;
	cwd: string | undefined;
	kind: ServerKind;
	npm: boolean;
	ports: Set<number>;
	envExample: Map<string, string>;
}

const ENV_EXAMPLES = ['.env.example', '.env.sample', '.env.template'];
const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];
const LOCAL_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)(.*)$/;
const RUNNER = /^(pnpm|yarn|bun|npm)(?: run)? ([\w:.-]+)/;
const DEFAULT_PORTS: Record<ServerKind, number | null> = { vite: 5173, next: 3000, other: null };

function parseEnvFile(text: string | null): Map<string, string> {
	const entries = new Map<string, string>();

	for (const line of (text ?? '').split('\n')) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);

		if (match) {
			entries.set(match[1]!, match[2]!.trim().replace(/^(['"])(.*)\1$/, '$2'));
		}
	}

	return entries;
}

// What the start command really runs: `pnpm dev` is whatever `scripts.dev` says.
function resolveStart(dir: string, start: string): { text: string; npm: boolean } {
	const match = RUNNER.exec(start);
	const script = match ? packageScripts(dir)[match[2]!] : undefined;

	return { text: script ?? start, npm: match?.[1] === 'npm' };
}

function serverKind(text: string): ServerKind {
	if (/\bnext dev\b/.test(text)) {
		return 'next';
	}

	return /\b(vite|react-router dev|remix vite:dev|astro dev)\b/.test(text) ? 'vite' : 'other';
}

// Every port this app would listen on if nobody told it otherwise — the only way
// to tell which app a `http://localhost:1506` in another app's `.env.example`
// means.
function defaultPorts(opts: { dir: string; script: string; kind: ServerKind; envExample: Map<string, string> }): Set<number> {
	const found = [
		opts.envExample.get('PORT'),
		...VITE_CONFIGS.map((file) => /\bport:\s*(\d+)/.exec(readText(path.join(opts.dir, file)) ?? '')?.[1]),
		/(?:--port[= ]|-p )(\d+)/.exec(opts.script)?.[1],
		DEFAULT_PORTS[opts.kind]?.toString()
	];

	return new Set(found.filter((value): value is string => value !== undefined && /^\d+$/.test(value)).map(Number));
}

function appFacts(root: string, name: string, app: App): AppFacts {
	const cwd = app.cwd ?? (isDirectory(path.join(root, name)) ? name : undefined);
	const dir = path.join(root, cwd ?? '.');
	const { text, npm } = resolveStart(dir, app.start);
	const kind = serverKind(text);
	const envExample = parseEnvFile(ENV_EXAMPLES.map((file) => readText(path.join(dir, file))).find((entry) => entry !== null) ?? null);

	return { name, cwd, kind, npm, ports: defaultPorts({ dir, script: text, kind, envExample }), envExample };
}

// A dev server takes its port as a flag, not from `PORT`, and must listen on the
// address every `{url.<app>}` renders to.
function withPortFlags(start: string, facts: AppFacts): string {
	if (facts.kind === 'other' || /--port\b|(?:^| )-p \d/.test(start)) {
		return start;
	}

	const separator = facts.npm && !start.includes(' -- ') ? ' --' : '';

	return facts.kind === 'vite'
		? `${start}${separator} --port {port} --strictPort --host 127.0.0.1`
		: `${start}${separator} --port {port} --hostname 127.0.0.1`;
}

// Each `.env.example` value that points at a local port another app listens on
// by default is rewired to where that app runs in this build.
function wiredEnv(facts: AppFacts, all: AppFacts[]): Record<string, string> {
	const env: Record<string, string> = { PORT: '{port}' };

	for (const [key, value] of facts.envExample) {
		const match = LOCAL_URL.exec(value);
		const owners = match ? all.filter((other) => other.ports.has(Number(match[1]))) : [];

		if (match && owners.length === 1) {
			env[key] = `{url.${owners[0]!.name}}${match[2]!.replace(/\/$/, '')}`;
		}
	}

	return env;
}

// Only on apps written above it: `apps` order is start order, and two apps that
// point at each other (a backend that links back to its frontend) still start.
function inferredDependsOn(env: Record<string, string>, facts: AppFacts, order: string[]): string[] | undefined {
	const earlier = order.slice(0, order.indexOf(facts.name));
	const named = earlier.filter((other) => Object.values(env).some((value) => value.includes(`{url.${other}}`)));

	return named.length === 0 ? undefined : named;
}

function inferApp(app: App, facts: AppFacts, all: AppFacts[]): App {
	const env = { ...wiredEnv(facts, all), ...app.env };

	return {
		...app,
		cwd: facts.cwd,
		start: withPortFlags(app.start, facts),
		env,
		ready: app.ready ?? (facts.kind === 'vite' ? '{url}/@vite/client' : '{url}'),
		dependsOn: app.dependsOn ?? inferredDependsOn(env, facts, all.map((entry) => entry.name))
	};
}

export function inferConfig(config: ProjectConfig, root: string): ProjectConfig {
	const entries = Object.entries(config.apps);
	const facts = entries.map(([name, app]) => appFacts(root, name, app));
	const inferred: ProjectConfig = {
		...config,
		setup: inferRerunWhen(config.setup, root),
		checks: inFolder(config.checks, root),
		apps: Object.fromEntries(entries.map(([name, app], index) => [name, inferApp(app, facts[index]!, facts)]))
	};

	return config.regenerate.length > 0 ? inferred : { ...inferred, regenerate: inferRegenerate({ config: inferred, root }) };
}
