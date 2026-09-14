import { describe, expect, it } from 'vitest';
import { credentialHelperCommand } from './workspace.service';
import { parseCredentialRequest } from '../commands/git-credential';

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
