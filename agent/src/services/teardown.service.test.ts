import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentFiles, getTeardownService } from './teardown.service';

describe('agentFiles', () => {
	const files = (binPath: string | null) =>
		agentFiles({ homeDir: '/home/u', configPath: '/home/u/.bosun/config.json', binPath }).map(
			(entry) => entry.path
		);

	// The whole point: the machine key, the Claude credential and every MCP
	// server's token live under here, and a de-provisioned box must not keep them.
	it('removes the directory holding every credential', () => {
		expect(files(null)).toContain('/home/u/.bosun');
	});

	it('removes the systemd unit', () => {
		expect(files(null)).toContain('/home/u/.config/systemd/user/bosun-agent.service');
	});

	// --config can put it outside ~/.bosun, where wiping the directory would miss it.
	it('names the config path separately from the directory', () => {
		const named = agentFiles({
			homeDir: '/home/u',
			configPath: '/etc/bosun/elsewhere.json',
			binPath: null
		}).map((entry) => entry.path);

		expect(named).toContain('/etc/bosun/elsewhere.json');
	});

	it('removes the binary and both upgrade leftovers when there is one', () => {
		expect(files('/home/u/.local/bin/bosun-agent')).toEqual(
			expect.arrayContaining([
				'/home/u/.local/bin/bosun-agent',
				'/home/u/.local/bin/bosun-agent.previous',
				'/home/u/.local/bin/bosun-agent.next'
			])
		);
	});

	// Claude Code's own store is not ours to delete: the operator set it up and it
	// is useful without bosun.
	it('never touches ~/.claude or the repo', () => {
		const all = files('/home/u/.local/bin/bosun-agent').join(' ');

		expect(all).not.toContain('.claude/');
		expect(all).not.toContain('/repo');
	});

	// The binary is removed last, while the agent is still running from it —
	// unlinking a running executable is fine, but a failure part-way through must
	// not leave credentials behind because the binary went first.
	it('removes the binary after the credentials', () => {
		const order = files('/home/u/.local/bin/bosun-agent');

		expect(order.indexOf('/home/u/.bosun')).toBeLessThan(
			order.indexOf('/home/u/.local/bin/bosun-agent')
		);
	});
});

describe('teardown removal', () => {
	let home: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-teardown-'));
		fs.mkdirSync(path.join(home, '.bosun'), { recursive: true });
		fs.mkdirSync(path.join(home, '.config', 'systemd', 'user'), { recursive: true });
		fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
		fs.writeFileSync(path.join(home, '.bosun', 'config.json'), '{}');
		fs.writeFileSync(path.join(home, '.bosun', 'env'), 'CLAUDE_CODE_OAUTH_TOKEN=secret');
		fs.writeFileSync(path.join(home, '.bosun', 'mcp.json'), '{}');
		fs.writeFileSync(path.join(home, '.config', 'systemd', 'user', 'bosun-agent.service'), 'unit');
		fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), 'not ours');
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service(execPath: string) {
		return getTeardownService({ homeDir: home, execPath });
	}

	it('erases the credentials, the config and the unit', () => {
		const binPath = path.join(home, 'bosun-agent');

		fs.writeFileSync(binPath, 'binary');

		const failures = service(binPath).remove(path.join(home, '.bosun', 'config.json'));

		expect(failures).toEqual([]);
		expect(fs.existsSync(path.join(home, '.bosun'))).toBe(false);
		expect(fs.existsSync(path.join(home, '.config', 'systemd', 'user', 'bosun-agent.service'))).toBe(false);
		expect(fs.existsSync(binPath)).toBe(false);
	});

	it('leaves Claude Code\'s own credential store alone', () => {
		service(path.join(home, 'bosun-agent')).remove(path.join(home, '.bosun', 'config.json'));

		expect(fs.existsSync(path.join(home, '.claude', '.credentials.json'))).toBe(true);
	});

	// Deleting the user's node install because a machine was removed in a browser
	// is not a tradeoff anyone would accept.
	it('refuses to delete the executable when it is not a packaged agent', () => {
		const nodePath = path.join(home, 'node');

		fs.writeFileSync(nodePath, 'node');

		const teardown = service(nodePath);

		expect(teardown.selfContained).toBe(false);
		teardown.remove(path.join(home, '.bosun', 'config.json'));
		expect(fs.existsSync(nodePath)).toBe(true);
		expect(fs.existsSync(path.join(home, '.bosun'))).toBe(false);
	});

	it('reports nothing missing when there was nothing to remove', () => {
		const teardown = service(path.join(home, 'bosun-agent'));

		teardown.remove(path.join(home, '.bosun', 'config.json'));

		expect(teardown.remove(path.join(home, '.bosun', 'config.json'))).toEqual([]);
	});
});
