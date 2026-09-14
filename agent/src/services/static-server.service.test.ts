import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { serveTree, type ServedTree } from './static-server.service';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) {
		await cleanup();
	}
});

function checkout(): { root: string; outside: string } {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-served-'));
	const root = path.join(base, 'tree');
	const outside = path.join(base, 'secret.txt');

	cleanups.push(() => fs.rmSync(base, { recursive: true, force: true }));
	fs.mkdirSync(path.join(root, '.claude', 'skills', 'design'), { recursive: true });
	fs.mkdirSync(path.join(root, '.git'), { recursive: true });
	fs.mkdirSync(path.join(root, 'be'), { recursive: true });
	fs.writeFileSync(path.join(root, '.claude', 'skills', 'design', 'prototype.html'), '<h1>prototype</h1>');
	fs.writeFileSync(path.join(root, '.git', 'config'), '[remote "origin"]');
	fs.writeFileSync(path.join(root, 'be', '.env'), 'DATABASE_URL=postgres://secret');
	fs.writeFileSync(outside, 'outside the checkout');
	fs.symlinkSync(outside, path.join(root, 'link.txt'));

	return { root, outside };
}

async function serve(root: string): Promise<ServedTree> {
	const served = await serveTree(root);

	cleanups.push(() => served.close());

	return served;
}

async function get(url: string, init?: RequestInit): Promise<{ status: number; body: string; type: string | null }> {
	const response = await fetch(url, init);

	return { status: response.status, body: await response.text(), type: response.headers.get('content-type') };
}

describe('serveTree', () => {
	it('serves a file under a dot-directory of the checkout, as html, on loopback', async () => {
		const { root } = checkout();
		const served = await serve(root);

		expect(served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
		expect(await get(`${served.url}/.claude/skills/design/prototype.html#On%20Hand.dc.html`)).toEqual({
			status: 200,
			body: '<h1>prototype</h1>',
			type: 'text/html; charset=utf-8'
		});
	});

	// The server is reachable by every process on the box, so it must hand out the
	// code a session reads and nothing a machine keeps beside it.
	it('refuses git metadata, env files, a way out of the checkout, and a link that leads out of it', async () => {
		const { root } = checkout();
		const served = await serve(root);

		for (const target of ['/.git/config', '/be/.env', '/../secret.txt', '/%2e%2e/secret.txt', '/link.txt']) {
			expect((await get(`${served.url}${target}`)).status, target).toBe(404);
		}
	});

	it('only reads', async () => {
		const { root } = checkout();
		const served = await serve(root);

		expect((await get(`${served.url}/.claude/skills/design/prototype.html`, { method: 'PUT', body: 'x' })).status).toBe(405);
	});
});
