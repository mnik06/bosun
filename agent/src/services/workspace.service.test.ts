import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExecService } from './exec.service';
import { credentialHelperCommand, getWorkspaceService } from './workspace.service';
import { enroll } from '../commands/enroll';
import { parseCredentialRequest } from '../commands/git-credential';
import { writeConfig, type AgentConfig } from '../config/config';

describe('credentialHelperCommand', () => {
	// git runs this line through a shell on every fetch and push. A path with a
	// space or a quote in it that is not quoted is a helper that silently never runs.
	it('runs the packaged binary directly, quoted', () => {
		expect(
			credentialHelperCommand({
				execPath: "/home/o'neil/.local/bin/bosun-agent",
				scriptPath: '/ignored.js',
				configPath: '/home/x/.bosun/config.json',
				defaultConfigPath: '/home/x/.bosun/config.json'
			})
		).toBe("!'/home/o'\\''neil/.local/bin/bosun-agent' git-credential");
	});

	it('runs node and the script when the agent is not packaged, and names a non-default config', () => {
		expect(
			credentialHelperCommand({
				execPath: '/usr/bin/node',
				scriptPath: '/srv/my agent/dist/src/index.js',
				configPath: '/etc/bosun/config.json',
				defaultConfigPath: '/home/x/.bosun/config.json'
			})
		).toBe("!'/usr/bin/node' '/srv/my agent/dist/src/index.js' git-credential --config '/etc/bosun/config.json'");
	});
});

describe('parseCredentialRequest', () => {
	it('reads git\'s key=value lines up to the blank line', () => {
		expect(parseCredentialRequest('protocol=https\nhost=github.com\npath=o/r.git\n\nignored=1\n')).toEqual({
			protocol: 'https',
			host: 'github.com',
			path: 'o/r.git'
		});
	});
});

describe('the config a running agent reads', () => {
	let home: string;
	let configPath: string;

	const base: AgentConfig = { serverUrl: 'https://bosun.example', machineId: 'm_self', machineKey: 'k' };

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-workspace-'));
		configPath = path.join(home, '.bosun', 'config.json');
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function workspace() {
		return getWorkspaceService({
			exec: getExecService(),
			configPath,
			defaultConfigPath: configPath,
			machineId: 'm_self',
			homeDir: home
		});
	}

	it('answers with the attached repository', () => {
		writeConfig({ configPath, config: { ...base, repository: { id: 'repo_1', slug: 'o-r', path: '/repos/o-r' } } });

		expect(workspace().repoPath()).toBe('/repos/o-r');
	});

	it('answers null only when the config names no repository', () => {
		writeConfig({ configPath, config: base });

		expect(workspace().repoPath()).toBeNull();
	});

	// What an enroll run on the box leaves behind: a valid config with no
	// repository, for a machine this agent is not. It used to read as "no
	// repository attached" on every plan.
	it('refuses a config that another enroll wrote over it, and says so', async () => {
		writeConfig({ configPath, config: { ...base, machineId: 'm_other' } });

		expect(() => workspace().repoPath()).toThrow(/now belongs to machine m_other, not m_self/);
		expect(workspace().repositoryId()).toBeNull();
		await expect(
			workspace().attach({
				type: 'repo.attach',
				repositoryId: 'repo_1',
				slug: 'o-r',
				cloneUrl: 'https://github.com/o/r.git',
				defaultBranch: 'main'
			})
		).resolves.toEqual({ ok: false, detail: expect.stringMatching(/now belongs to machine m_other/) });
	});

	it('refuses a config that cannot be read, rather than reading as no repository', () => {
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, '{ not json');

		expect(() => workspace().repoPath()).toThrow();
	});
});

describe('enroll', () => {
	let home: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-enroll-'));
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	// Refused before the server is asked, so the code is not spent and the file a
	// running agent reads is left exactly as it was.
	it('will not replace an existing config without force', async () => {
		const configPath = path.join(home, 'config.json');
		const existing: AgentConfig = { serverUrl: 'https://bosun.example', machineId: 'm_live', machineKey: 'k' };

		writeConfig({ configPath, config: existing });
		const before = fs.readFileSync(configPath, 'utf8');

		await expect(
			enroll({ serverUrl: 'http://127.0.0.1:9', token: 't', repoPath: null, configPath })
		).rejects.toThrow(/already holds machine m_live/);
		expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
	});
});
