import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseProjectConfig, type ProjectConfig } from '../project-config';
import {
	ensureProjectEnv,
	isLocalSecret,
	isPlaceholder,
	mapSupabaseStatus,
	requiredKeys,
	supabaseStatusCommand,
	valueFor
} from './env-autofill';
import { type ExecService } from './exec.service';
import { getProjectEnvService } from './project-env.service';

describe('isPlaceholder', () => {
	it.each([
		['', true],
		['changeme', true],
		['CHANGE_ME', true],
		['<your key>', true],
		['your-api-key', true],
		['sk_live_...', true],
		['xxxx', true],
		['${API_URL}', true],
		['http://127.0.0.1:54321', false],
		['3000', false],
		['eyJhbGciOiJFUzI1NiJ9.e30.sig', false],
		['smtp://127.0.0.1:54325', false]
	])('%j -> %s', (value, expected) => {
		expect(isPlaceholder(value)).toBe(expected);
	});
});

describe('isLocalSecret', () => {
	it.each([
		['SESSION_SECRET', true],
		['JWT_SECRET', true],
		['ENCRYPTION_KEY', true],
		['APP_SECRET', true],
		['STRIPE_SECRET_KEY', false],
		['GITHUB_CLIENT_SECRET', false],
		['SUPABASE_JWT_SECRET', false],
		['OPENAI_API_KEY', false],
		['RELEASE_API_TOKEN', false]
	])('%s -> %s', (key, expected) => {
		expect(isLocalSecret(key)).toBe(expected);
	});
});

describe('requiredKeys', () => {
	it('skips an empty optional key and one the config provides, and keeps an empty local secret', () => {
		const example = new Map([
			['DATABASE_URL', 'postgres://127.0.0.1:5432/app'],
			['SENTRY_DSN', ''],
			['SESSION_SECRET', ''],
			['PORT', '3000'],
			['STRIPE_KEY', 'changeme']
		]);

		expect(requiredKeys({ path: 'api', example, provided: new Set(['PORT']) })).toEqual(['DATABASE_URL', 'SESSION_SECRET', 'STRIPE_KEY']);
	});
});

describe('supabase', () => {
	it('derives the status command from the start command, prefix and all', () => {
		expect(supabaseStatusCommand('pnpm --filter @app/api exec supabase start -x studio,storage-api')).toBe(
			'pnpm --filter @app/api exec supabase status -o env'
		);
		expect(supabaseStatusCommand('docker compose up -d --wait')).toBeNull();
	});

	it('maps its output to the keys an app reads, and only those', () => {
		const status = new Map([
			['API_URL', 'http://127.0.0.1:54321'],
			['ANON_KEY', 'anon'],
			['SERVICE_ROLE_KEY', 'service'],
			['DB_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'],
			['STUDIO_URL', 'http://127.0.0.1:54323']
		]);

		expect(
			mapSupabaseStatus({
				status,
				keys: ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'APP_URL']
			})
		).toEqual({
			SUPABASE_URL: 'http://127.0.0.1:54321',
			VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
			VITE_SUPABASE_ANON_KEY: 'anon',
			SUPABASE_SERVICE_ROLE_KEY: 'service',
			DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
		});
	});
});

describe('valueFor', () => {
	it('prefers the running service, then the example, then a generated local secret', () => {
		expect(valueFor({ key: 'SUPABASE_URL', example: 'http://127.0.0.1:1', service: { SUPABASE_URL: 'http://127.0.0.1:2' }, stored: undefined })).toBe(
			'http://127.0.0.1:2'
		);
		expect(valueFor({ key: 'APP_URL', example: 'http://127.0.0.1:5300', service: {}, stored: undefined })).toBe('http://127.0.0.1:5300');
		expect(valueFor({ key: 'SESSION_SECRET', example: '', service: {}, stored: undefined })).toMatch(/^[0-9a-f]{64}$/);
		expect(valueFor({ key: 'STRIPE_KEY', example: 'changeme', service: {}, stored: undefined })).toBeNull();
	});

	// Rotating a session secret on every run signs everyone out.
	it('keeps a secret it generated before', () => {
		expect(valueFor({ key: 'SESSION_SECRET', example: '', service: {}, stored: 'kept' })).toBe('kept');
	});
});

describe('ensureProjectEnv', () => {
	let home: string;
	let root: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-autofill-home-'));
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-autofill-root-'));
		fs.mkdirSync(path.join(root, 'apps/api'), { recursive: true });
		fs.writeFileSync(
			path.join(root, 'apps/api/.env.example'),
			[
				'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres',
				'SUPABASE_URL=http://127.0.0.1:54321',
				'SUPABASE_SERVICE_ROLE_KEY=from-example',
				'SESSION_SECRET=',
				'STRIPE_KEY=your-stripe-key',
				'# OPTIONAL_TOKEN=',
				''
			].join('\n')
		);
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
		fs.rmSync(root, { recursive: true, force: true });
	});

	function config(services: string): ProjectConfig {
		const parsed = parseProjectConfig(`${services}Apps:\napi:\n- Cwd: apps/api\n- Start: pnpm dev\n`);

		if (!parsed.ok) {
			throw new Error(JSON.stringify(parsed.issues));
		}

		return parsed.config;
	}

	function exec(stdout: string) {
		return { run: vi.fn().mockResolvedValue({ ok: true, stdout, stderr: '', reason: '' }) } as unknown as ExecService;
	}

	it('fills what it can, never touches an operator key, and names the rest', async () => {
		const projectEnv = getProjectEnvService({ homeDir: home });

		projectEnv.set({ path: 'apps/api', vars: [{ key: 'DATABASE_URL', value: 'postgres://operator' }] });

		const runner = exec('API_URL="http://127.0.0.1:54321"\nSERVICE_ROLE_KEY="from-status"\nDB_URL="postgresql://status"');
		const result = await ensureProjectEnv({
			projectEnv,
			exec: runner,
			config: config('Services:\nsupabase:\n- Start: pnpm exec supabase start\n- Check: true\n- Stop: pnpm exec supabase stop\n\n'),
			root,
			env: {}
		});

		expect(result.missing).toEqual([{ path: 'apps/api', keys: ['STRIPE_KEY'] }]);
		expect(runner.run).toHaveBeenCalledWith('sh', ['-c', 'pnpm exec supabase status -o env'], expect.objectContaining({ cwd: root }));

		const stored = projectEnv.read('apps/api');

		expect(stored.vars.DATABASE_URL).toBe('postgres://operator');
		expect(stored.vars.SUPABASE_SERVICE_ROLE_KEY).toBe('from-status');
		expect(stored.vars.SUPABASE_URL).toBe('http://127.0.0.1:54321');
		expect(stored.vars.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/);
		expect([...stored.auto].sort()).toEqual(['SESSION_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
	});

	it('asks for nothing once the operator has given what it could not fill', async () => {
		const projectEnv = getProjectEnvService({ homeDir: home });

		projectEnv.set({ path: 'apps/api', vars: [{ key: 'STRIPE_KEY', value: 'sk_test_real' }] });

		const result = await ensureProjectEnv({ projectEnv, exec: exec(''), config: config(''), root, env: {} });

		expect(result.missing).toEqual([]);
		expect(projectEnv.read('apps/api').vars.SUPABASE_SERVICE_ROLE_KEY).toBe('from-example');
	});
});
