import crypto from 'crypto';
import path from 'path';
import { type ProjectConfig } from '../project-config';
import { type MissingEnv } from '../env-frames';
import { isDirectory, readText } from './config-inference-steps';
import { type ExecService } from './exec.service';
import { normalizeEnvPath, type ProjectEnvService } from './project-env.service';

// A run needs every key its app's `.env.example` names. Most of them bosun can
// fill on its own — the example's local value, what a running service prints, a
// random local secret — and only what is left is a question for a person.
// See project-env.service.md, "Filled by bosun".

export const ENV_EXAMPLES = ['.env.example', '.env.sample', '.env.template'];
const STATUS_TIMEOUT_MS = 60_000;

const PLACEHOLDER = [
	/^(change[-_ ]?me|replace[-_ ]?me|todo|tbd|fixme|null|none|undefined|secret|password|example|placeholder)$/i,
	/^x{3,}$/i,
	/^\*+$/,
	/\.\.\./,
	/^<.*>$/,
	/^\{\{.*\}\}$/,
	/^\$\{.*\}$/,
	/(^|[-_])your[-_]/i,
	/^your[A-Z]/
];

// A secret no other system issues: any random value works, as long as it stays
// the same. A vendor's key or token is never one — those come from the vendor.
const LOCAL_SECRET = /(^|_)(SECRET|SECRET_KEY|SESSION_SECRET|COOKIE_SECRET|JWT_SECRET|ENCRYPTION_KEY|SIGNING_KEY|APP_KEY|HASH_SALT|PEPPER)$/;
const THIRD_PARTY =
	/(^|_)(STRIPE|GITHUB|GITLAB|OPENAI|ANTHROPIC|AWS|GOOGLE|GCP|AZURE|SENTRY|SLACK|TWILIO|SENDGRID|RESEND|POSTMARK|MAILGUN|CLERK|AUTH0|SUPABASE|FIREBASE|PUSHER|ALGOLIA|CLOUDINARY|VERCEL|NETLIFY|DISCORD|PAYPAL|SHOPIFY|NOTION|LINEAR|JIRA|HUBSPOT|MAPBOX|OAUTH|CLIENT)(_|$)/;

// `supabase status -o env` names → the keys an app reads them under. Small on
// purpose: a guess that maps the wrong value is worse than a question.
const SUPABASE_KEYS: { source: string; matches: RegExp }[] = [
	{ source: 'API_URL', matches: /(^|_)SUPABASE_URL$/ },
	{ source: 'ANON_KEY', matches: /(^|_)SUPABASE_ANON_KEY$/ },
	{ source: 'PUBLISHABLE_KEY', matches: /(^|_)SUPABASE_PUBLISHABLE(_DEFAULT)?_KEY$/ },
	{ source: 'SERVICE_ROLE_KEY', matches: /(^|_)SERVICE_ROLE_KEY$/ },
	{ source: 'SECRET_KEY', matches: /(^|_)SUPABASE_SECRET_KEY$/ },
	{ source: 'JWT_SECRET', matches: /(^|_)SUPABASE_JWT_SECRET$/ },
	{ source: 'DB_URL', matches: /^(DATABASE_URL|DIRECT_URL)$|(^|_)SUPABASE_DB_URL$/ }
];

export interface EnvTarget {
	path: string;
	// Every key the folder's example names, with the value written there.
	example: Map<string, string>;
	// Keys the config hands the app at start, which no `.env` needs to carry.
	provided: Set<string>;
}

export function isPlaceholder(value: string): boolean {
	return value.trim() === '' || PLACEHOLDER.some((pattern) => pattern.test(value.trim()));
}

export function isLocalSecret(key: string): boolean {
	return LOCAL_SECRET.test(key) && !THIRD_PARTY.test(key);
}

export function parseEnvText(text: string | null): Map<string, string> {
	const entries = new Map<string, string>();

	for (const line of (text ?? '').split('\n')) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);

		if (match) {
			entries.set(match[1]!, match[2]!.trim().replace(/^(['"])(.*)\1$/, '$2'));
		}
	}

	return entries;
}

// One target per folder an app runs in. Two apps in one folder share its `.env`,
// so a key counts as provided only when the config hands it to both.
export function envTargets(opts: { config: ProjectConfig; root: string }): EnvTarget[] {
	const byPath = new Map<string, EnvTarget>();

	for (const app of Object.values(opts.config.apps)) {
		const envPath = normalizeEnvPath(app.cwd ?? '.');

		if (envPath === null || !isDirectory(path.join(opts.root, envPath))) {
			continue;
		}

		const dir = path.join(opts.root, envPath);
		const provided = new Set(Object.keys(app.env ?? {}));
		const existing = byPath.get(envPath);

		if (existing) {
			existing.provided = new Set([...existing.provided].filter((key) => provided.has(key)));

			continue;
		}

		const example = parseEnvText(ENV_EXAMPLES.map((file) => readText(path.join(dir, file))).find((text) => text !== null) ?? null);

		byPath.set(envPath, { path: envPath, example, provided });
	}

	return [...byPath.values()];
}

// An empty example value is how a project says "optional" — unless the key is a
// local secret, which bosun can make up. A placeholder says the opposite: some
// value is needed, and it is not this one.
export function requiredKeys(target: EnvTarget): string[] {
	return [...target.example]
		.filter(([key, value]) => !target.provided.has(key) && (value.trim() !== '' || isLocalSecret(key)))
		.map(([key]) => key)
		.sort();
}

export function supabaseStatusCommand(start: string): string | null {
	return /\bsupabase\s+start\b/.test(start) ? start.replace(/\bsupabase\s+start\b.*$/, 'supabase status -o env') : null;
}

export function mapSupabaseStatus(opts: { status: Map<string, string>; keys: string[] }): Record<string, string> {
	const values: Record<string, string> = {};

	for (const key of opts.keys) {
		const rule = SUPABASE_KEYS.find((entry) => entry.matches.test(key));
		const value = rule ? opts.status.get(rule.source) : undefined;

		if (value !== undefined && value !== '') {
			values[key] = value;
		}
	}

	return values;
}

// What a key gets, in order: the running service's own value, the example's, a
// generated secret. Null leaves it to the operator.
export function valueFor(opts: {
	key: string;
	example: string | undefined;
	service: Record<string, string>;
	stored: string | undefined;
}): string | null {
	const fromService = opts.service[opts.key];

	if (fromService !== undefined) {
		return fromService;
	}

	if (opts.example !== undefined && !isPlaceholder(opts.example)) {
		return opts.example;
	}

	// Generated once. Rotating it on every run would sign out every session and
	// break whatever the old value encrypted.
	if (isLocalSecret(opts.key)) {
		return opts.stored ?? crypto.randomBytes(32).toString('hex');
	}

	return null;
}

async function serviceValues(opts: {
	exec: ExecService;
	config: ProjectConfig;
	root: string;
	env: NodeJS.ProcessEnv;
	keys: string[];
}): Promise<Record<string, string>> {
	const wanted = opts.keys.filter((key) => SUPABASE_KEYS.some((entry) => entry.matches.test(key)));

	if (wanted.length === 0) {
		return {};
	}

	for (const service of Object.values(opts.config.services)) {
		const command = supabaseStatusCommand(service.start);

		if (command === null) {
			continue;
		}

		const result = await opts.exec.run('sh', ['-c', command], {
			cwd: path.join(opts.root, service.cwd ?? '.'),
			env: opts.env,
			timeoutMs: STATUS_TIMEOUT_MS
		});

		// Never the output itself in a log: it is the service's keys.
		if (!result.ok) {
			console.error(`env: supabase status failed (${result.reason.slice(0, 120)}); its values are not filled`);

			return {};
		}

		return mapSupabaseStatus({ status: parseEnvText(result.stdout), keys: wanted });
	}

	return {};
}

// Fills every key bosun can and names the rest. Run after the services are up,
// so a service's values are the running ones.
export async function ensureProjectEnv(opts: {
	projectEnv: ProjectEnvService;
	exec: ExecService;
	config: ProjectConfig;
	root: string;
	env: NodeJS.ProcessEnv;
}): Promise<{ filled: string[]; missing: MissingEnv[] }> {
	const filled: string[] = [];
	const missing: MissingEnv[] = [];

	for (const target of envTargets(opts)) {
		const stored = opts.projectEnv.read(target.path);
		// An operator's key is never asked about or replaced.
		const open = requiredKeys(target).filter((key) => !Object.hasOwn(stored.vars, key) || stored.auto.has(key));

		if (open.length === 0) {
			continue;
		}

		const service = await serviceValues({ ...opts, keys: open });
		const values: Record<string, string> = {};
		const unfilled: string[] = [];

		for (const key of open) {
			const value = valueFor({ key, example: target.example.get(key), service, stored: stored.vars[key] });

			if (value !== null) {
				values[key] = value;
			} else if (!Object.hasOwn(stored.vars, key)) {
				unfilled.push(key);
			}
		}

		filled.push(...opts.projectEnv.fill({ path: target.path, values }).map((key) => `${target.path}:${key}`));

		if (unfilled.length > 0) {
			missing.push({ path: target.path, keys: unfilled });
		}
	}

	return { filled, missing };
}

export function describeMissingEnv(missing: MissingEnv[]): string {
	return missing.map((entry) => `${entry.path === '.' ? '.env' : `${entry.path}/.env`}: ${entry.keys.join(', ')}`).join('; ');
}
