import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EnvVarInput } from '../protocol';
import {
	describeEnvSets,
	formatEnvValue,
	getProjectEnvService,
	mergeEnvFile,
	normalizeEnvPath
} from './project-env.service';

const SECRET = 'postgres://app:hunter2@db.internal:5432/app';

describe('normalizeEnvPath', () => {
	it.each([
		['be', 'be'],
		['/be', 'be'],
		['./be', 'be'],
		['././be/', 'be'],
		['  apps/web  ', 'apps/web'],
		['.hidden', '.hidden'],
		['/', '.'],
		['', '.'],
		['.', '.'],
		['./', '.'],
		['//be', 'be'],
		['/./be', null],
		['../x', null],
		['a/../b', null],
		['a/./b', null],
		['a//b', null],
		['a\\b', null],
		['a\0b', null],
		['has space', null],
		['x'.repeat(200), 'x'.repeat(200)],
		['x'.repeat(201), null]
	])('%j -> %j', (raw, expected) => {
		expect(normalizeEnvPath(raw)).toBe(expected);
	});
});

describe('formatEnvValue', () => {
	it.each([
		[SECRET, SECRET],
		['', "''"],
		['has space', "'has space'"],
		['$HOME#x', "'$HOME#x'"],
		["it's", `"it's"`],
		[`it's "quoted" \\ here`, `"it's \\"quoted\\" \\\\ here"`]
	])('%j -> %s', (value, expected) => {
		expect(formatEnvValue(value)).toBe(expected);
	});
});

describe('mergeEnvFile', () => {
	// The worktree's `.env` starts as the machine checkout's, and the lines bosun
	// was not given are somebody's settings on this box.
	it('replaces a provided key in place and leaves every other line alone', () => {
		const existing = ['# local', 'PORT=3000', 'DATABASE_URL=postgres://localhost/dev', '', 'LOG_LEVEL=debug', ''].join('\n');

		expect(mergeEnvFile(existing, { DATABASE_URL: SECRET })).toBe(
			['# local', 'PORT=3000', `DATABASE_URL=${SECRET}`, '', 'LOG_LEVEL=debug', ''].join('\n')
		);
	});

	// Most readers take the last definition, so a duplicate left below would win.
	it('drops later definitions of a provided key', () => {
		expect(mergeEnvFile('A=1\nB=2\nexport A=3\n', { A: 'x' })).toBe('A=x\nB=2\n');
	});

	it('keeps an export prefix on the line it replaces', () => {
		expect(mergeEnvFile('  export A = old\n', { A: 'new' })).toBe('export A=new\n');
	});

	it('appends missing keys and always ends with a newline', () => {
		expect(mergeEnvFile('PORT=3000', { A: '1', B: 'two words' })).toBe("PORT=3000\nA=1\nB='two words'\n");
		expect(mergeEnvFile('', { A: '1' })).toBe('A=1\n');
	});

	it('does not mistake a longer key sharing the prefix for the provided one', () => {
		expect(mergeEnvFile('DATABASE_URL_POOL=a\n', { DATABASE_URL: 'b' })).toBe(
			'DATABASE_URL_POOL=a\nDATABASE_URL=b\n'
		);
	});
});

describe('describeEnvSets', () => {
	it('names a short key list and counts a long one', () => {
		expect(
			describeEnvSets([
				{ path: '.', keys: ['NODE_ENV'], updatedAt: '' },
				{ path: 'be', keys: ['DATABASE_URL', 'SUPABASE_KEY'], updatedAt: '' },
				{ path: 'fe', keys: ['NUXT_PUBLIC_API_URL', 'NUXT_PUBLIC_SUPABASE_KEY', 'NUXT_PUBLIC_SUPABASE_URL'], updatedAt: '' }
			])
		).toBe('.env: NODE_ENV · be/.env: DATABASE_URL, SUPABASE_KEY · fe/.env: 3 keys');
	});
});

describe('getProjectEnvService', () => {
	let home: string;
	let worktree: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-project-env-'));
		worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-project-env-worktree-'));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(home, { recursive: true, force: true });
		fs.rmSync(worktree, { recursive: true, force: true });
	});

	function service() {
		return getProjectEnvService({ homeDir: home });
	}

	function thrownBy(fn: () => unknown): string | null {
		try {
			fn();
		} catch (error) {
			return (error as Error).message;
		}

		return null;
	}

	it('stores a set privately and reports it by key name only', () => {
		const env = service();
		const summary = env.set({
			path: '/be',
			vars: [
				{ key: 'SUPABASE_KEY', value: 'sb-hunter2' },
				{ key: 'DATABASE_URL', value: SECRET }
			]
		});

		expect(summary).toEqual([
			{ path: 'be', keys: ['DATABASE_URL', 'SUPABASE_KEY'], updatedAt: expect.any(String) }
		]);
		expect(JSON.stringify(summary)).not.toContain('hunter2');
		expect(fs.statSync(env.storePath).mode & 0o777).toBe(0o600);
		// Written through a temp file; one left behind would be a second copy.
		expect(fs.readdirSync(path.dirname(env.storePath))).toEqual(['project-env.json']);
	});

	// The browser never holds a value, so an edit that keeps one sends null — and
	// a key it leaves out is one the operator removed.
	it('keeps the stored value for a null and drops keys the set no longer names', () => {
		const env = service();

		env.set({ path: 'be', vars: [{ key: 'DATABASE_URL', value: SECRET }, { key: 'OLD', value: 'x' }] });
		env.set({ path: 'be', vars: [{ key: 'DATABASE_URL', value: null }, { key: 'NEW', value: 'y' }] });
		fs.mkdirSync(path.join(worktree, 'be'));
		env.applyTo(worktree);

		expect(env.summary().map((set) => set.keys)).toEqual([['DATABASE_URL', 'NEW']]);
		expect(fs.readFileSync(path.join(worktree, 'be', '.env'), 'utf8')).toBe(`DATABASE_URL=${SECRET}\nNEW=y\n`);
	});

	const refused: [string, { path: string; vars: EnvVarInput[] }, string][] = [
		['a null with nothing stored', { path: 'be', vars: [{ key: 'DATABASE_URL', value: null }] }, 'no stored value for DATABASE_URL'],
		['a duplicate key', { path: 'be', vars: [{ key: 'A', value: 'hunter2' }, { key: 'A', value: 'hunter2' }] }, 'duplicate key A'],
		['a path outside the worktree', { path: '../x', vars: [{ key: 'A', value: 'hunter2' }] }, 'invalid path'],
		['a multi-line value', { path: 'be', vars: [{ key: 'A', value: 'hunter2\nB=1' }] }, 'must be a single line']
	];

	// The message is sent to the browser as `env.error`.
	it.each(refused)('refuses %s without echoing a value', (_label, input, expected) => {
		const message = thrownBy(() => service().set(input));

		expect(message).toContain(expected);
		expect(message).not.toContain('hunter2');
	});

	it('deletes a set and treats one that is already gone as deleted', () => {
		const env = service();

		env.set({ path: 'be', vars: [{ key: 'A', value: '1' }] });

		expect(env.delete('/be/')).toEqual([]);
		expect(env.delete('be')).toEqual([]);
	});

	// `hello` reads the store on every announce, so a store that throws is an agent
	// that never connects.
	it('treats a corrupt store as empty and says so once, without its content', () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = service();

		fs.mkdirSync(path.dirname(env.storePath), { recursive: true });
		fs.writeFileSync(env.storePath, `{"sets":{"be":{"vars":{"DATABASE_URL":"${SECRET}"`);

		expect(env.summary()).toEqual([]);
		expect(env.summary()).toEqual([]);
		expect(logged).toHaveBeenCalledOnce();
		expect(String(logged.mock.calls[0]?.[0])).not.toContain('hunter2');
	});

	// The store is hand-editable, and a path `set` would never have accepted is a
	// `.env` written outside the worktree.
	it('ignores a stored path that escapes the worktree', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = service();
		const outside = `bosun-escape-${path.basename(worktree)}`;

		fs.mkdirSync(path.dirname(env.storePath), { recursive: true });
		fs.writeFileSync(
			env.storePath,
			JSON.stringify({ sets: { [`../${outside}`]: { vars: { A: '1' }, updatedAt: 'x' } } })
		);

		expect(env.applyTo(worktree)).toEqual({ written: [], skipped: [] });
		expect(fs.existsSync(path.join(path.dirname(worktree), outside))).toBe(false);
	});

	describe('applyTo', () => {
		it('merges into an existing .env and keeps the mode its owner gave it', () => {
			const env = service();
			const file = path.join(worktree, 'be', '.env');

			fs.mkdirSync(path.join(worktree, 'be'));
			fs.writeFileSync(file, 'PORT=3000\nDATABASE_URL=postgres://localhost/dev\n');
			fs.chmodSync(file, 0o644);
			env.set({ path: 'be', vars: [{ key: 'DATABASE_URL', value: SECRET }] });

			expect(env.applyTo(worktree)).toEqual({ written: ['be/.env'], skipped: [] });
			expect(fs.readFileSync(file, 'utf8')).toBe(`PORT=3000\nDATABASE_URL=${SECRET}\n`);
			expect(fs.statSync(file).mode & 0o777).toBe(0o644);
		});

		it('creates a missing .env readable by this user only, at the root for "."', () => {
			const env = service();

			env.set({ path: '/', vars: [{ key: 'A', value: '1' }] });

			expect(env.applyTo(worktree)).toEqual({ written: ['.env'], skipped: [] });
			expect(fs.statSync(path.join(worktree, '.env')).mode & 0o777).toBe(0o600);
		});

		// A directory this branch does not have is not one to invent: it would be
		// committed with the bullet.
		it('skips a path the worktree does not have, without creating it', () => {
			const env = service();

			env.set({ path: 'apps/api', vars: [{ key: 'A', value: '1' }] });

			expect(env.applyTo(worktree)).toEqual({ written: [], skipped: ['apps/api/.env'] });
			expect(fs.existsSync(path.join(worktree, 'apps'))).toBe(false);
		});
	});
});
