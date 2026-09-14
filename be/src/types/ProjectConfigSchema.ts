import { parseDocument } from 'yaml';
import { z } from 'zod';

// Mirrored in `agent/src/project-config.ts`. The backend validates a draft and a
// published config with it; the agent validates the file it finds in a tree.
// Two copies that disagree would mean a config bosun accepts and a machine
// refuses, so a change here is a change there in the same commit.

export const PROJECT_CONFIG_PATH = '.bosun/project.yaml';

// A queue owns ten ports and an app's port is its position in `apps`.
export const MAX_APPS = 10;

export const DEFAULT_READY_TIMEOUT_SECONDS = 90;

const MAX_SOURCE_CHARS = 100_000;

const APP_NAME = /^[a-z][a-z0-9-]{0,30}$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLACEHOLDER = /\{(port|url)(?:\.([^}]*))?\}/g;

function insideRepository(value: string): boolean {
	if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
		return false;
	}

	return value.split('/').every((segment) => segment !== '..' && segment !== '');
}

const RelativePathSchema = z
	.string()
	.min(1)
	.max(200)
	.refine(insideRepository, 'must be a relative path inside the repository');

const CommandSchema = z.string().trim().min(1).max(2000);

const SetupStepSchema = z
	.object({
		name: z.string().trim().min(1).max(80),
		cwd: RelativePathSchema.optional(),
		run: CommandSchema,
		rerunWhen: z.array(RelativePathSchema).max(20).optional()
	})
	.strict();

const CheckSchema = z
	.object({
		name: z.string().trim().min(1).max(80).optional(),
		cwd: RelativePathSchema.optional(),
		run: CommandSchema
	})
	.strict();

const AppSchema = z
	.object({
		cwd: RelativePathSchema.optional(),
		start: CommandSchema,
		env: z.record(z.string().regex(ENV_KEY, 'must be an env variable name'), z.string().max(2000)).optional(),
		ready: z.string().min(1).max(500).optional(),
		readyTimeoutSeconds: z.number().int().min(1).max(900).optional(),
		dependsOn: z.array(z.string()).max(MAX_APPS).optional(),
		migrate: CommandSchema.optional(),
		codegen: CommandSchema.optional()
	})
	.strict();

const TestAccountSchema = z
	.object({
		role: z.string().trim().min(1).max(40),
		signIn: z.string().min(1).max(500),
		secrets: z.array(z.string().regex(ENV_KEY, 'must be an env variable name')).min(1).max(10)
	})
	.strict();

const ToolchainSchema = z
	.object({
		// Exact, because a range resolves to whatever is newest the day a machine
		// provisions it, and two machines on one config would build differently.
		node: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be an exact version, such as 24.15.0'),
		packageManager: z
			.string()
			.regex(/^(npm|pnpm|yarn)@\d+\.\d+\.\d+$/, 'must be name@exact-version, such as pnpm@11.8.0')
			.optional()
	})
	.strict();

const BaseSchema = z
	.object({
		version: z.literal(1),
		toolchain: ToolchainSchema.optional(),
		setup: z.array(SetupStepSchema).max(30).default([]),
		apps: z.record(z.string().regex(APP_NAME, 'app names are lowercase letters, digits and dashes'), AppSchema).default({}),
		checks: z.array(CheckSchema).max(30).default([]),
		testAccounts: z.array(TestAccountSchema).max(10).default([]),
		notes: z.string().max(10_000).optional()
	})
	.strict();

type Base = z.infer<typeof BaseSchema>;

type IssueSink = (issue: { path: (string | number)[]; message: string }) => void;

function checkPlaceholders(opts: {
	value: string;
	path: (string | number)[];
	apps: Set<string>;
	insideApp: boolean;
	report: IssueSink;
}): void {
	for (const match of opts.value.matchAll(PLACEHOLDER)) {
		const target = match[2];

		if (target === undefined && !opts.insideApp) {
			opts.report({ path: opts.path, message: `${match[0]} only means something inside an app — name one, as {${match[1]}.<app>}` });
		}

		if (target !== undefined && !opts.apps.has(target)) {
			opts.report({ path: opts.path, message: `${match[0]} names no app in apps` });
		}
	}
}

// Depth-first, so the path reported is the cycle itself rather than every app
// that happens to sit downstream of it.
function findCycle(apps: Base['apps']): string[] | null {
	const state = new Map<string, 'visiting' | 'done'>();

	const visit = (name: string, trail: string[]): string[] | null => {
		if (state.get(name) === 'done') {
			return null;
		}

		if (state.get(name) === 'visiting') {
			return [...trail.slice(trail.indexOf(name)), name];
		}

		state.set(name, 'visiting');

		for (const dependency of apps[name]?.dependsOn ?? []) {
			const cycle = apps[dependency] === undefined ? null : visit(dependency, [...trail, name]);

			if (cycle) {
				return cycle;
			}
		}

		state.set(name, 'done');

		return null;
	};

	for (const name of Object.keys(apps)) {
		const cycle = visit(name, []);

		if (cycle) {
			return cycle;
		}
	}

	return null;
}

function checkApps(config: Base, report: IssueSink): void {
	const names = Object.keys(config.apps);
	const apps = new Set(names);

	if (names.length > MAX_APPS) {
		report({ path: ['apps'], message: `at most ${MAX_APPS} apps — a queue holds ten ports and each app takes one` });
	}

	for (const [name, app] of Object.entries(config.apps)) {
		(app.dependsOn ?? []).forEach((dependency, index) => {
			if (!apps.has(dependency) || dependency === name) {
				report({ path: ['apps', name, 'dependsOn', index], message: `${dependency} is not another app in apps` });
			}
		});

		const templated: [string, string][] = [
			['start', app.start],
			...(app.ready === undefined ? [] : [['ready', app.ready] as [string, string]]),
			...Object.entries(app.env ?? {}).map(([key, value]) => [`env.${key}`, value] as [string, string])
		];

		for (const [field, value] of templated) {
			checkPlaceholders({ value, path: ['apps', name, ...field.split('.')], apps, insideApp: true, report });
		}
	}

	const cycle = findCycle(config.apps);

	if (cycle) {
		report({ path: ['apps'], message: `dependsOn forms a cycle: ${cycle.join(' → ')}` });
	}
}

export const ProjectConfigSchema = BaseSchema.superRefine((config, ctx) => {
	const report: IssueSink = (issue) => {
		ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
	};
	const apps = new Set(Object.keys(config.apps));
	const seen = new Set<string>();

	config.setup.forEach((step, index) => {
		if (seen.has(step.name)) {
			report({ path: ['setup', index, 'name'], message: `${step.name} is used by another setup step — rerunWhen is tracked by name` });
		}

		seen.add(step.name);
	});

	checkApps(config, report);

	config.testAccounts.forEach((account, index) => {
		checkPlaceholders({ value: account.signIn, path: ['testAccounts', index, 'signIn'], apps, insideApp: false, report });
	});
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export type ProjectConfigApp = ProjectConfig['apps'][string];

export interface ConfigIssue {
	path: string;
	message: string;
}

export type ConfigParse = { ok: true; config: ProjectConfig } | { ok: false; issues: ConfigIssue[] };

export function formatIssuePath(path: readonly PropertyKey[]): string {
	return path.reduce<string>((joined, segment) => {
		if (typeof segment === 'number') {
			return `${joined}[${segment}]`;
		}

		return joined === '' ? String(segment) : `${joined}.${String(segment)}`;
	}, '') || '(root)';
}

// The message is what reaches a session and the browser. A YAML error is cut to
// its first line: the rest is a code frame of the source, which is noise in a
// one-line failure reason.
export function parseProjectConfig(source: string): ConfigParse {
	if (source.length > MAX_SOURCE_CHARS) {
		return { ok: false, issues: [{ path: '(root)', message: `longer than ${MAX_SOURCE_CHARS} characters` }] };
	}

	const doc = parseDocument(source, { prettyErrors: true, uniqueKeys: true });

	if (doc.errors.length > 0) {
		return {
			ok: false,
			issues: doc.errors.map((error) => ({ path: '(yaml)', message: error.message.split('\n')[0] ?? 'invalid YAML' }))
		};
	}

	const parsed = ProjectConfigSchema.safeParse(doc.toJS());

	if (!parsed.success) {
		return {
			ok: false,
			issues: parsed.error.issues.map((issue) => ({ path: formatIssuePath(issue.path), message: issue.message }))
		};
	}

	return { ok: true, config: parsed.data };
}

export function describeIssues(issues: ConfigIssue[]): string {
	return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}
