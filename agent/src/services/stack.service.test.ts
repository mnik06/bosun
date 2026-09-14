import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { type ProjectConfig } from '../project-config';
import { type MemoryService } from './memory.service';
import { appPorts, getStackService, renderTemplate, startOrder } from './stack.service';

function config(apps: ProjectConfig['apps']): ProjectConfig {
	return { version: 1, setup: [], apps, checks: [], testAccounts: [] };
}

const temps: string[] = [];

afterEach(() => {
	for (const dir of temps.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-stack-'));

	temps.push(dir);

	return dir;
}

const unscoped = { sessionScope: () => null } as unknown as MemoryService;

async function answers(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });

		return await response.text();
	} catch {
		return null;
	}
}

// Serves whatever API_URL it was given, so the test can see the wiring arrived.
const SERVER = `node -e "require('http').createServer((q,s)=>s.end(process.env.API_URL||'ok')).listen(Number(process.env.PORT),'127.0.0.1')"`;

describe('startOrder', () => {
	const apps = config({
		fe: { start: 'x', dependsOn: ['be'] },
		be: { start: 'x', dependsOn: ['db'] },
		db: { start: 'x' },
		docs: { start: 'x' }
	});

	it('starts dependencies before the apps that need them', () => {
		expect(startOrder(apps)).toEqual(['db', 'be', 'fe', 'docs']);
	});

	it('brings in what a requested app depends on, and nothing else', () => {
		expect(startOrder(apps, ['fe'])).toEqual(['db', 'be', 'fe']);
	});

	it('refuses an app the config does not have', () => {
		expect(() => startOrder(apps, ['api'])).toThrow('no app named api in apps');
	});
});

describe('ports and templates', () => {
	const ports = appPorts(config({ be: { start: 'x' }, fe: { start: 'x' } }), 4100);

	it('gives each app the port at its position', () => {
		expect(ports).toEqual({ be: 4100, fe: 4101 });
	});

	it('renders its own and other apps’ ports and urls', () => {
		expect(renderTemplate('dev --port {port} --api {url.be} --self {url} --be {port.be}', { app: 'fe', ports })).toBe(
			'dev --port 4101 --api http://127.0.0.1:4100 --self http://127.0.0.1:4101 --be 4100'
		);
	});

	it('leaves a placeholder it cannot resolve as written', () => {
		expect(renderTemplate('{url.nope} {port}', { app: null, ports })).toBe('{url.nope} {port}');
	});
});

describe('up and down', () => {
	const portBase = 20_000 + Math.floor(Math.random() * 20_000);

	it('starts apps in order with each other’s urls, and down stops every one', async () => {
		const homeDir = tempDir();
		const stack = getStackService({ memory: unscoped, homeDir });
		const wired = config({
			fe: { start: SERVER, dependsOn: ['be'], env: { PORT: '{port}', API_URL: '{url.be}' }, ready: '{url}' },
			be: { start: SERVER, env: { PORT: '{port}' }, ready: '{url.be}' }
		});

		const result = await stack.up({ key: 'sr_1', config: wired, worktreePath: homeDir, portBase, env: process.env, memoryMaxBytes: null });

		expect(result).toEqual({
			ok: true,
			apps: [
				{ app: 'be', port: portBase + 1, url: `http://127.0.0.1:${portBase + 1}`, log: path.join(homeDir, '.bosun', 'logs', 'sr_1', 'be.log') },
				{ app: 'fe', port: portBase, url: `http://127.0.0.1:${portBase}`, log: path.join(homeDir, '.bosun', 'logs', 'sr_1', 'fe.log') }
			]
		});
		expect(await answers(`http://127.0.0.1:${portBase}`)).toBe(`http://127.0.0.1:${portBase + 1}`);
		expect(stack.running('sr_1')).toEqual(['be', 'fe']);

		await stack.down('sr_1');

		expect(await answers(`http://127.0.0.1:${portBase}`)).toBeNull();
		expect(await answers(`http://127.0.0.1:${portBase + 1}`)).toBeNull();
		expect(stack.running('sr_1')).toEqual([]);
	}, 30_000);

	it('names the app that failed with its log, and stops what it had already started', async () => {
		const homeDir = tempDir();
		const stack = getStackService({ memory: unscoped, homeDir });
		const broken = config({
			api: { start: SERVER, env: { PORT: '{port}' }, ready: '{url}' },
			web: { start: 'echo boom; exit 3', dependsOn: ['api'], ready: '{url}' }
		});

		const result = await stack.up({ key: 'sr_2', config: broken, worktreePath: homeDir, portBase: portBase + 20, env: process.env, memoryMaxBytes: null });

		expect(result).toEqual({
			ok: false,
			app: 'web',
			reason: 'exited before it was ready (code 3)',
			logTail: expect.stringContaining('boom')
		});
		expect(await answers(`http://127.0.0.1:${portBase + 20}`)).toBeNull();
		expect(stack.running('sr_2')).toEqual([]);
	}, 30_000);

	it('does nothing for a stack it never started', async () => {
		await expect(getStackService({ memory: unscoped, homeDir: tempDir() }).down('nope')).resolves.toBeUndefined();
	});
});
