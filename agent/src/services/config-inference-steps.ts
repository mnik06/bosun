import fs from 'fs';
import path from 'path';
import { type ProjectConfig } from '../project-config';

// The install and integration half of `config-inference.ts`: which lockfile
// re-runs an install, and which generated files an integration renumbers.

type SetupStep = ProjectConfig['setup'][number];
type RegenerateRule = ProjectConfig['regenerate'][number];

// Only the lockfiles whose package manager can rewrite them without installing.
const LOCKFILE_ONLY: Record<string, string | null> = {
	'pnpm-lock.yaml': 'pnpm install --lockfile-only',
	'package-lock.json': 'npm install --package-lock-only',
	'yarn.lock': null,
	'bun.lock': null,
	'bun.lockb': null
};
const DRIZZLE_CONFIGS = ['drizzle.config.ts', 'drizzle.config.mts', 'drizzle.config.js', 'drizzle.config.mjs'];

export function readText(file: string): string | null {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return null;
	}
}

export function isDirectory(dir: string): boolean {
	try {
		return fs.statSync(dir).isDirectory();
	} catch {
		return false;
	}
}

export function packageScripts(dir: string): Record<string, string> {
	try {
		const parsed = JSON.parse(readText(path.join(dir, 'package.json')) ?? '{}') as { scripts?: Record<string, string> };

		return parsed.scripts ?? {};
	} catch {
		return {};
	}
}

function relative(cwd: string | undefined, file: string): string {
	return cwd === undefined ? file : path.posix.join(cwd, file);
}

function lockfileOf(root: string, cwd: string | undefined): string | null {
	return Object.keys(LOCKFILE_ONLY).find((file) => fs.existsSync(path.join(root, cwd ?? '.', file))) ?? null;
}

// `- be: pnpm install` runs in `be` when the tree has that folder — a name that
// is not one (`- Lint all: ...`) runs from the root, as it always did.
export function inFolder<T extends { name?: string; cwd?: string }>(steps: T[], root: string): T[] {
	return steps.map((step) => {
		const folder = step.cwd === undefined && step.name !== undefined && !step.name.includes(' ') ? step.name : null;

		return folder !== null && isDirectory(path.join(root, folder))
			? { ...step, cwd: folder }
			: step;
	});
}

// An install re-runs when the lockfile beside it changes.
export function inferRerunWhen(setup: SetupStep[], root: string): SetupStep[] {
	return inFolder(setup, root).map((step) => {
		const lockfile = step.rerunWhen === undefined ? lockfileOf(root, step.cwd) : null;

		return lockfile === null ? step : { ...step, rerunWhen: [relative(step.cwd, lockfile)] };
	});
}

function runScript(manager: string, script: string): string {
	return manager === 'npm' ? `npm run ${script}` : `${manager} ${script}`;
}

function drizzleRule(opts: { root: string; cwd: string | undefined; name: string; manager: string }): RegenerateRule | null {
	const dir = path.join(opts.root, opts.cwd ?? '.');
	const script = Object.entries(packageScripts(dir)).find(([, text]) => /\bdrizzle-kit generate\b/.test(text))?.[0];

	if (script === undefined) {
		return null;
	}

	const drizzleConfig = DRIZZLE_CONFIGS.map((file) => readText(path.join(dir, file))).find((text) => text !== null) ?? '';
	const out = (/\bout:\s*['"`](?:\.\/)?([^'"`]+?)\/?['"`]/.exec(drizzleConfig)?.[1]) ?? 'drizzle';

	return { name: `Migrations ${opts.name}`, cwd: opts.cwd, paths: [relative(opts.cwd, `${out}/**`)], run: runScript(opts.manager, script) };
}

function lockfileRule(root: string, step: SetupStep): RegenerateRule | null {
	const lockfile = lockfileOf(root, step.cwd);
	const run = lockfile === null ? null : LOCKFILE_ONLY[lockfile];

	return lockfile === null || !run ? null : { name: `Lockfile ${step.name}`, cwd: step.cwd, paths: [relative(step.cwd, lockfile)], run };
}

// Drizzle numbers its migrations, so two branches that each generate one collide
// on the same number; a lockfile is merged by regenerating it. Anything else a
// project generates is left to its config.
export function inferRegenerate(opts: { config: ProjectConfig; root: string }): RegenerateRule[] {
	const manager = opts.config.toolchain?.packageManager?.split('@')[0] ?? 'npm';
	const folders = new Map<string, string | undefined>([
		['root', undefined],
		...Object.entries(opts.config.apps).map(([name, app]): [string, string | undefined] => [name, app.cwd]),
		...opts.config.setup.map((step): [string, string | undefined] => [step.name, step.cwd])
	]);
	const seen = new Set<string>();
	const migrations = [...folders].flatMap(([name, cwd]) => {
		const key = cwd ?? '.';

		if (seen.has(key)) {
			return [];
		}

		seen.add(key);

		return [drizzleRule({ root: opts.root, cwd, name, manager })];
	});
	const lockfiles = opts.config.setup.map((step) => lockfileRule(opts.root, step));

	return [...migrations, ...lockfiles].filter((rule): rule is RegenerateRule => rule !== null);
}
