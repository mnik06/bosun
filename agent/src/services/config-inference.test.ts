import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseProjectConfig, type ProjectConfig } from '../project-config';
import { inferConfig } from './config-inference';

const SHORT = `Toolchain:
- Node 24.15.0
- pnpm 11.8.0

Install:
- be: pnpm install
- fe: pnpm install

Apps:
be:
- Migrate: pnpm db:migration:run
- Start: pnpm local
fe:
- Start: pnpm dev
`;

const roots: string[] = [];

function tree(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-inference-'));

	roots.push(root);

	for (const [file, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), text);
	}

	return root;
}

function parsed(source: string): ProjectConfig {
	const result = parseProjectConfig(source);

	if (!result.ok) {
		throw new Error(JSON.stringify(result.issues));
	}

	return result.config;
}

// Shaped like bosun itself: be reads PORT and links back to fe, fe is a Vite app
// whose vite.config moved it off Vite's default port while be's .env.example still
// points at the default.
const BOSUN_LIKE = {
	'be/package.json': JSON.stringify({ scripts: { local: 'nodemon src/api.ts', 'db:migration:generate': 'drizzle-kit generate' } }),
	'be/.env.example': 'PORT=1506\nPUBLIC_SERVER_URL=http://127.0.0.1:1506\nPUBLIC_APP_URL=http://127.0.0.1:5173/\nDATABASE_URL=postgres://u:p@127.0.0.1:5432/db\n',
	'be/drizzle.config.ts': "export default { out: './drizzle-out', schema: './src/schema.ts' };",
	'be/pnpm-lock.yaml': '',
	'fe/package.json': JSON.stringify({ scripts: { dev: 'react-router dev' } }),
	'fe/.env.example': 'VITE_API_URL="http://localhost:1506/api"\n',
	'fe/vite.config.ts': 'export default { server: { port: 5373 } };',
	'fe/pnpm-lock.yaml': ''
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('inferConfig', () => {
	it('wires ports, sibling URLs, readiness and start order from the tree', () => {
		const config = inferConfig(parsed(SHORT), tree(BOSUN_LIKE));

		expect(config.apps.be).toEqual({
			cwd: 'be',
			migrate: 'pnpm db:migration:run',
			start: 'pnpm local',
			env: { PORT: '{port}', PUBLIC_SERVER_URL: '{url.be}', PUBLIC_APP_URL: '{url.fe}' },
			ready: '{url}',
			dependsOn: undefined
		});
		expect(config.apps.fe).toEqual({
			cwd: 'fe',
			start: 'pnpm dev --port {port} --strictPort --host 127.0.0.1',
			env: { PORT: '{port}', VITE_API_URL: '{url.be}/api' },
			ready: '{url}/@vite/client',
			dependsOn: ['be']
		});
	});

	it('re-runs each install on its own lockfile and renumbers drizzle migrations', () => {
		const config = inferConfig(parsed(SHORT), tree(BOSUN_LIKE));

		expect(config.setup.map((step) => step.rerunWhen)).toEqual([['be/pnpm-lock.yaml'], ['fe/pnpm-lock.yaml']]);
		expect(config.regenerate).toEqual([
			{ name: 'Migrations be', cwd: 'be', paths: ['be/drizzle-out/**'], run: 'pnpm db:migration:generate' },
			{ name: 'Lockfile be', cwd: 'be', paths: ['be/pnpm-lock.yaml'], run: 'pnpm install --lockfile-only' },
			{ name: 'Lockfile fe', cwd: 'fe', paths: ['fe/pnpm-lock.yaml'], run: 'pnpm install --lockfile-only' }
		]);
	});

	it('never overrides what the config says', () => {
		const source = SHORT.replace('- Start: pnpm dev', '- Start: pnpm dev --port {port}\n- Env VITE_API_URL: {url.be}/v2\n- Ready: {url}');
		const config = inferConfig(parsed(source), tree(BOSUN_LIKE));

		expect(config.apps.fe!.start).toBe('pnpm dev --port {port}');
		expect(config.apps.fe!.env!.VITE_API_URL).toBe('{url.be}/v2');
		expect(config.apps.fe!.ready).toBe('{url}');
	});

	// Two apps that would both default to 5173 leave a URL to 5173 unowned rather
	// than guessed.
	it('leaves a URL alone when more than one app could own its port', () => {
		const root = tree({
			'a/package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
			'b/package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
			'b/.env.example': 'VITE_OTHER=http://localhost:5173\n'
		});
		const config = inferConfig(parsed('Apps:\na:\n- Start: npm run dev\nb:\n- Start: npm run dev\n'), root);

		expect(config.apps.b!.env).toEqual({ PORT: '{port}' });
		expect(config.apps.a!.start).toBe('npm run dev -- --port {port} --strictPort --host 127.0.0.1');
	});

	it('runs an app from the root when no folder carries its name', () => {
		const config = inferConfig(parsed('Apps:\nweb:\n- Start: node server.js\n'), tree({ 'server.js': '' }));

		expect(config.apps.web!.cwd).toBeUndefined();
		expect(config.apps.web!.ready).toBe('{url}');
	});
});
