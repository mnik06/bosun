import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { type EnvSetSummary, type EnvVarInput } from '../protocol';

export const PROJECT_ENV_FILENAME = 'project-env.json';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_PATH_LENGTH = 200;
const MAX_VALUE_LENGTH = 10_000;

// Past this many characters the preflight line names a count instead: it shares
// one row with every other set, and a row that wraps is one nobody reads.
const NAMED_KEYS_MAX_CHARS = 40;

const RAW_VALUE_PATTERN = /^[A-Za-z0-9_\-./:@%+,=?&]*$/;
const DEFINITION_PATTERN = /^\s*(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

const StoreSchema = z.object({
	sets: z.record(
		z.string(),
		z.object({ vars: z.record(z.string(), z.string()), updatedAt: z.string() })
	)
});

type Store = z.infer<typeof StoreSchema>;

// The backend applies the identical rules before the frame is sent. They are
// repeated here because this is the side that turns the path into a file on
// disk, and a relayed `../` is a write outside the worktree.
export function normalizeEnvPath(raw: string): string | null {
	let candidate = raw.trim();

	if (candidate.includes('\\') || candidate.includes('\0')) {
		return null;
	}

	while (candidate.startsWith('./')) {
		candidate = candidate.slice(2);
	}

	candidate = candidate.replace(/^\/+/, '').replace(/\/+$/, '');

	// `.` is what the summary calls the root, so it is what the browser sends back
	// to edit or delete that set. The segment rule below would refuse it.
	if (candidate === '' || candidate === '.') {
		return '.';
	}

	const valid = candidate
		.split('/')
		.every((segment) => segment !== '.' && segment !== '..' && SEGMENT_PATTERN.test(segment));

	return valid && candidate.length <= MAX_PATH_LENGTH ? candidate : null;
}

export function envFileFor(envPath: string): string {
	return envPath === '.' ? '.env' : `${envPath}/.env`;
}

// Quoted only when it has to be, so a file somebody opens by hand still reads
// like one they wrote. Single quotes first: no dotenv reader expands inside them.
export function formatEnvValue(value: string): string {
	if (value === '') {
		return "''";
	}

	if (RAW_VALUE_PATTERN.test(value)) {
		return value;
	}

	if (!value.includes("'")) {
		return `'${value}'`;
	}

	return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

// The project's own `.env` is kept, not replaced: the worktree copy starts as
// the machine checkout's untracked file, and the lines bosun was not given are
// ones somebody on this box put there on purpose. A later duplicate is dropped
// because most readers take the last definition, which would quietly win.
export function mergeEnvFile(existing: string, vars: Record<string, string>): string {
	const pending = new Map(Object.entries(vars));
	const seen = new Set<string>();
	const lines = existing === '' ? [] : existing.replace(/\n$/, '').split('\n');
	const merged: string[] = [];

	for (const line of lines) {
		const match = DEFINITION_PATTERN.exec(line);
		const key = match?.[2];

		if (key === undefined || !pending.has(key)) {
			merged.push(line);

			continue;
		}

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		// A file written to be `source`d keeps working as one.
		merged.push(`${match?.[1] ?? ''}${key}=${formatEnvValue(pending.get(key)!)}`);
	}

	for (const [key, value] of pending) {
		if (!seen.has(key)) {
			merged.push(`${key}=${formatEnvValue(value)}`);
		}
	}

	return `${merged.join('\n')}\n`;
}

export function describeEnvSets(sets: EnvSetSummary[]): string {
	if (sets.length === 0) {
		return 'none provided — add them under Project setup';
	}

	return sets
		.map((set) => {
			const names = set.keys.join(', ');
			const keys =
				names.length <= NAMED_KEYS_MAX_CHARS
					? names
					: `${set.keys.length} key${set.keys.length === 1 ? '' : 's'}`;

			return `${envFileFor(set.path)}: ${keys}`;
		})
		.join(' · ');
}

// Paths only. This is the journal line, and the journal is the one place on the
// box a value must never end up by accident.
export function describeApplied(result: { written: string[]; skipped: string[] }): string | null {
	const parts = [
		result.written.length === 0 ? '' : `wrote ${result.written.join(', ')}`,
		result.skipped.length === 0
			? ''
			: `skipped ${result.skipped.join(', ')} (no such directory in this worktree)`
	].filter(Boolean);

	return parts.length === 0 ? null : `env: ${parts.join('; ')}`;
}

// Every message thrown from here reaches the browser as `env.error`, so none of
// them may carry a value — only paths and key names, which the operator typed
// and can already see.
function checkedVars(opts: {
	vars: EnvVarInput[];
	stored: Record<string, string>;
}): Record<string, string> {
	if (opts.vars.length === 0) {
		throw new Error('at least one variable is required');
	}

	const next: Record<string, string> = {};

	for (const entry of opts.vars) {
		if (!KEY_PATTERN.test(entry.key)) {
			throw new Error(`invalid key ${JSON.stringify(entry.key.slice(0, 100))}`);
		}

		if (Object.hasOwn(next, entry.key)) {
			throw new Error(`duplicate key ${entry.key}`);
		}

		if (entry.value === null) {
			if (!Object.hasOwn(opts.stored, entry.key)) {
				throw new Error(`no stored value for ${entry.key}`);
			}

			next[entry.key] = opts.stored[entry.key]!;

			continue;
		}

		if (/[\r\n]/.test(entry.value)) {
			throw new Error(`the value for ${entry.key} must be a single line`);
		}

		if (entry.value.length > MAX_VALUE_LENGTH) {
			throw new Error(`the value for ${entry.key} is longer than ${MAX_VALUE_LENGTH} characters`);
		}

		next[entry.key] = entry.value;
	}

	return next;
}

// An entry is only trusted if it could have been stored through `set`. The file
// is hand-editable, and a path that escapes the worktree or a value with a
// newline in it would otherwise be written into every bullet.
function storedSetIsValid(envPath: string, set: Store['sets'][string]): boolean {
	return (
		normalizeEnvPath(envPath) === envPath &&
		Object.entries(set.vars).every(([key, value]) => KEY_PATTERN.test(key) && !/[\r\n]/.test(value))
	);
}

// `be` being a file is the same answer as `be` being absent: there is nowhere to
// put a `.env` for it.
function isDirectory(dir: string): boolean {
	try {
		return fs.statSync(dir).isDirectory();
	} catch {
		return false;
	}
}

export function getProjectEnvService(deps: { homeDir?: string }) {
	const storePath = path.join(deps.homeDir ?? os.homedir(), '.bosun', PROJECT_ENV_FILENAME);
	// Logged on the way into a bad state rather than on every read: `summary()`
	// runs on each announce and each bullet, and a line per call buries the one
	// that says what happened.
	let warned = false;

	function warn(reason: string): void {
		if (!warned) {
			warned = true;
			console.error(`env: ignoring ${storePath}: ${reason}`);
		}
	}

	// Read from disk each time, like every other file under ~/.bosun, so an edit
	// or a restore by hand takes effect without restarting the unit.
	function load(): Store {
		let raw: string;

		try {
			raw = fs.readFileSync(storePath, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				warn('it could not be read');
			}

			return { sets: {} };
		}

		let json: unknown;

		// Never the parse error itself: JSON.parse and zod both quote the input, and
		// the input is the values.
		try {
			json = JSON.parse(raw);
		} catch {
			warn('it is not valid JSON');

			return { sets: {} };
		}

		const parsed = StoreSchema.safeParse(json);

		if (!parsed.success) {
			warn('it is not a valid env store');

			return { sets: {} };
		}

		const sets = Object.fromEntries(
			Object.entries(parsed.data.sets).filter(([envPath, set]) => storedSetIsValid(envPath, set))
		);

		if (Object.keys(sets).length !== Object.keys(parsed.data.sets).length) {
			warn('some of its entries are invalid and were skipped');
		} else {
			warned = false;
		}

		return { sets };
	}

	// Written beside the target and renamed over it, so a crash mid-write leaves
	// the previous store rather than a truncated one — which would read as corrupt
	// and silently drop every set on the machine.
	function save(store: Store): void {
		const dir = path.dirname(storePath);
		const temp = path.join(dir, `.${PROJECT_ENV_FILENAME}.${process.pid}.${Date.now()}.tmp`);

		fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

		try {
			fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
			fs.renameSync(temp, storePath);
		} catch (error) {
			fs.rmSync(temp, { force: true });

			throw error;
		}
	}

	function summarize(store: Store): EnvSetSummary[] {
		return Object.entries(store.sets)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([envPath, set]) => ({
				path: envPath,
				keys: Object.keys(set.vars).sort(),
				updatedAt: set.updatedAt
			}));
	}

	function pathOrThrow(raw: string): string {
		const normalized = normalizeEnvPath(raw);

		if (normalized === null) {
			throw new Error(`invalid path ${JSON.stringify(raw.slice(0, MAX_PATH_LENGTH))}`);
		}

		return normalized;
	}

	return {
		storePath,

		summary(): EnvSetSummary[] {
			return summarize(load());
		},

		// Replaces rather than merges, so removing a key in the browser removes it
		// here. `null` is how the browser keeps a value it was never sent back.
		set(opts: { path: string; vars: EnvVarInput[] }): EnvSetSummary[] {
			const envPath = pathOrThrow(opts.path);
			const store = load();
			const vars = checkedVars({ vars: opts.vars, stored: store.sets[envPath]?.vars ?? {} });

			store.sets[envPath] = { vars, updatedAt: new Date().toISOString() };
			save(store);

			return summarize(store);
		},

		// Only the stored set. A `.env` already written into a worktree stays: it may
		// hold lines of the project's own, and a running bullet may be reading it.
		delete(rawPath: string): EnvSetSummary[] {
			const envPath = pathOrThrow(rawPath);
			const store = load();

			if (!Object.hasOwn(store.sets, envPath)) {
				return summarize(store);
			}

			delete store.sets[envPath];
			save(store);

			return summarize(store);
		},

		// A directory the worktree does not have is skipped, never created: a set
		// for `be` on a branch that predates `be/` is not a reason to invent one, and
		// a stray directory would be committed with the bullet.
		applyTo(worktreePath: string): { written: string[]; skipped: string[] } {
			const written: string[] = [];
			const skipped: string[] = [];

			for (const [envPath, set] of Object.entries(load().sets).sort(([a], [b]) => a.localeCompare(b))) {
				const file = envFileFor(envPath);
				const dir = envPath === '.' ? worktreePath : path.join(worktreePath, envPath);

				if (!isDirectory(dir)) {
					skipped.push(file);

					continue;
				}

				const target = path.join(worktreePath, file);
				let existing = '';

				try {
					existing = fs.readFileSync(target, 'utf8');
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
						throw new Error(`could not read ${file}: ${(error as NodeJS.ErrnoException).code ?? 'unknown error'}`);
					}
				}

				try {
					// The mode only applies when the file is created, which is the intent:
					// an existing `.env` keeps whatever mode its owner gave it.
					fs.writeFileSync(target, mergeEnvFile(existing, set.vars), { mode: 0o600 });
				} catch (error) {
					throw new Error(`could not write ${file}: ${(error as NodeJS.ErrnoException).code ?? 'unknown error'}`);
				}

				written.push(file);
			}

			return { written, skipped };
		}
	};
}

export type ProjectEnvService = ReturnType<typeof getProjectEnvService>;
