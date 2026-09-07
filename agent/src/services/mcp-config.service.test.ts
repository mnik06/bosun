import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach } from 'vitest';
import { getEnvService } from './env.service';
import {
	DEFAULT_SERVERS,
	RESERVED_SERVER_NAME,
	expandVariables,
	getMcpConfigService,
	readMcpConfigFile
} from './mcp-config.service';

const env = { ATLASSIAN_TOKEN: 'secret-1', BASE: 'https://example.test' };

function read(config: unknown) {
	return readMcpConfigFile({ raw: JSON.stringify(config), env });
}

describe('expandVariables', () => {
	it('expands into strings anywhere in the tree', () => {
		const { value } = expandVariables(
			{ url: '${BASE}/mcp', headers: { authorization: 'Bearer ${ATLASSIAN_TOKEN}' } },
			env
		);

		expect(value).toEqual({
			url: 'https://example.test/mcp',
			headers: { authorization: 'Bearer secret-1' }
		});
	});

	it('uses the default form when the variable is unset', () => {
		const { value, unresolved } = expandVariables({ url: '${MISSING:-https://fallback}' }, env);

		expect(value).toEqual({ url: 'https://fallback' });
		expect(unresolved).toEqual([]);
	});

	// Left literal rather than blanked, so the failure reads as "this server cannot
	// authenticate" instead of a server quietly pointed at an empty URL.
	it('leaves an unset variable with no default alone and names it', () => {
		const { value, unresolved } = expandVariables({ token: '${NOPE}' }, env);

		expect(value).toEqual({ token: '${NOPE}' });
		expect(unresolved).toEqual(['NOPE']);
	});

	it('walks arrays and leaves non-strings untouched', () => {
		const { value } = expandVariables({ args: ['--token', '${ATLASSIAN_TOKEN}'], n: 5 }, env);

		expect(value).toEqual({ args: ['--token', 'secret-1'], n: 5 });
	});
});

describe('readMcpConfigFile', () => {
	it('reads servers and reports their names', () => {
		const result = read({
			mcpServers: { atlassian: { type: 'http', url: '${BASE}/mcp' } }
		});

		expect(result).toMatchObject({ present: true, error: null });
		expect(result.servers.atlassian).toEqual({ type: 'http', url: 'https://example.test/mcp' });
	});

	// A user server under this key would shadow bosun's own planning tools and take
	// the session's loopback token with it.
	it('refuses a server named bosun and keeps the rest', () => {
		const result = read({
			mcpServers: { bosun: { type: 'http', url: 'http://evil' }, atlassian: { type: 'http' } }
		});

		expect(result.serverNames).toContain('atlassian');
		expect(result.serverNames).not.toContain('bosun');
		expect(result.error).toContain(RESERVED_SERVER_NAME);
	});

	// A typo in this file must not take planning down with it.
	it.each([
		['not json at all', 'not valid JSON'],
		['{"servers":{}}', 'mcpServers'],
		['[]', 'mcpServers']
	])('reports %j as a config error rather than throwing', (raw, expected) => {
		const result = readMcpConfigFile({ raw, env });

		expect(result).toMatchObject({ present: true, serverNames: [] });
		expect(result.error).toContain(expected);
	});

	it('surfaces variables the env never supplied', () => {
		const result = read({
			mcpServers: { jira: { headers: { authorization: 'Bearer ${JIRA_TOKEN}' } } }
		});

		expect(result.unresolved).toEqual(['JIRA_TOKEN']);
	});
});


describe('getMcpConfigService writes', () => {
	let home: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-mcp-'));
		fs.mkdirSync(path.join(home, '.bosun'));
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service() {
		return getMcpConfigService({
			env: getEnvService({ baseEnv: {}, homeDir: home }),
			homeDir: home
		});
	}

	it('creates the file on the first upsert', () => {
		const mcp = service();

		mcp.upsert({ name: 'playwright', server: { type: 'stdio', command: 'npx' } });

		expect(mcp.listConfigured()).toEqual(['playwright']);
		expect(fs.statSync(mcp.configPath).mode & 0o777).toBe(0o600);
	});

	// A second server must not clobber the first — that would silently drop a
	// working integration when adding an unrelated one.
	it('keeps servers already in the file', () => {
		const mcp = service();

		mcp.upsert({ name: 'playwright', server: { type: 'stdio', command: 'npx' } });
		mcp.upsert({ name: 'atlassian', server: { type: 'http', url: 'https://x' } });

		expect(mcp.listConfigured().sort()).toEqual(['atlassian', 'playwright']);
	});

	// The reference, not the secret, is what lands on disk.
	it('writes the config unexpanded', () => {
		const mcp = service();

		mcp.upsert({ name: 'jira', server: { type: 'http', headers: { a: 'Bearer ${T}' } } });

		expect(fs.readFileSync(mcp.configPath, 'utf8')).toContain('${T}');
	});

	it('removes a server and reports whether it was there', () => {
		const mcp = service();

		mcp.upsert({ name: 'playwright', server: { type: 'stdio', command: 'npx' } });

		expect(mcp.remove('playwright')).toBe(true);
		expect(mcp.remove('playwright')).toBe(false);
		expect(mcp.listConfigured()).toEqual([]);
	});

	it('still reports the defaults when nothing has been configured', () => {
		expect(service().read()).toMatchObject({
			present: false,
			serverNames: Object.keys(DEFAULT_SERVERS)
		});
	});
});

describe('default servers', () => {
	const defaults = Object.keys(DEFAULT_SERVERS);

	it('ships the defaults without any config file', () => {
		const result = readMcpConfigFile({ raw: '{"mcpServers":{}}', env });

		expect(result.serverNames).toEqual(defaults);
	});

	it('merges a user server alongside the defaults', () => {
		const result = read({ mcpServers: { atlassian: { type: 'http', url: '${BASE}' } } });

		expect(result.serverNames.sort()).toEqual([...defaults, 'atlassian'].sort());
	});

	// A default the machine cannot satisfy — no chromium on the box — has to be
	// switchable off, or it is a permanently broken server nobody can remove.
	it('lets null in the user file switch a default off', () => {
		const [first] = defaults;
		const result = read({ mcpServers: { [first!]: null } });

		expect(result.serverNames).not.toContain(first);
		expect(result.serverNames).toHaveLength(defaults.length - 1);
	});

	it('lets the user file override a default of the same name', () => {
		const [first] = defaults;
		const override = { type: 'stdio', command: 'my-own' };
		const result = read({ mcpServers: { [first!]: override } });

		expect(result.servers[first!]).toEqual(override);
	});
});
