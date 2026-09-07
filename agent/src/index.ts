#!/usr/bin/env node
import path from 'path';
import { Command } from 'commander';
import { setClaudeToken, showClaudeAuth } from './commands/auth';
import { enroll } from './commands/enroll';
import { addMcpPreset, checkMcpServers, listMcpServers, removeMcpServer } from './commands/mcp';
import { run } from './commands/run';
import { defaultConfigPath, readConfig } from './config/config';
import { AGENT_VERSION } from './version';

const program = new Command();

program.name('bosun-agent').description('Bosun machine agent').version(AGENT_VERSION);

program
	.command('enroll')
	.description('Exchange a one-time enrollment code for a machine key')
	.option('--server <url>', 'bosun backend base URL', process.env.BOSUN_SERVER)
	.option('--token <token>', 'one-time enrollment code (prefer the BOSUN_TOKEN env var)')
	.option('--repo <path>', 'repository this machine works in', process.cwd())
	.option('--config <path>', 'where to write the agent config', defaultConfigPath())
	.action(async (opts: { server?: string; token?: string; repo: string; config: string }) => {
		// The token is read from the environment first: argv is world-readable
		// through /proc/<pid>/cmdline, while /proc/<pid>/environ is owner-only.
		const token = process.env.BOSUN_TOKEN ?? opts.token;
		const serverUrl = opts.server;

		if (!serverUrl) {
			throw new Error('Missing --server (or BOSUN_SERVER)');
		}

		if (!token) {
			throw new Error('Missing enrollment code — set BOSUN_TOKEN or pass --token');
		}

		const configPath = path.resolve(opts.config);
		const config = await enroll({
			serverUrl,
			token,
			repoPath: path.resolve(opts.repo),
			configPath
		});

		console.log(`Enrolled as ${config.machineId}`);
		console.log(`Config written to ${configPath}`);
	});

const auth = program.command('auth').description('Manage this machine\'s Claude credential');

auth
	.command('set')
	.description('Paste a Claude token, check it against the API, and save it')
	.action(async () => {
		await setClaudeToken();
	});

auth
	.command('status')
	.description('Show whether this machine has a working Claude credential')
	.action(async () => {
		await showClaudeAuth();
	});

const mcp = program.command('mcp').description('Manage this machine\'s MCP servers');

mcp
	.command('list')
	.description('Show configured MCP servers and the presets available')
	.option('--config <path>', 'path to the agent config', defaultConfigPath())
	.action(async (opts: { config: string }) => {
		await listMcpServers({ config: readConfig(path.resolve(opts.config)) });
	});

mcp
	.command('check')
	.description('Connect to every configured MCP server and report what answers')
	.action(async () => {
		await checkMcpServers();
	});

mcp
	.command('add')
	.argument('<id>', 'preset id, as shown by `bosun-agent mcp list`')
	.description('Add an MCP server from a bosun preset, prompting for any credential it needs')
	.option('--config <path>', 'path to the agent config', defaultConfigPath())
	.action(async (id: string, opts: { config: string }) => {
		await addMcpPreset({ config: readConfig(path.resolve(opts.config)), id });
	});

mcp
	.command('remove')
	.argument('<name>', 'server name to remove')
	.description('Remove an MCP server from this machine')
	.action((name: string) => {
		removeMcpServer({ name });
	});

program
	.command('run')
	.description('Hold an outbound connection to the bosun backend')
	.option('--config <path>', 'path to the agent config', defaultConfigPath())
	.action(async (opts: { config: string }) => {
		const configPath = path.resolve(opts.config);

		await run({ config: readConfig(configPath), configPath });
	});

program.parseAsync(process.argv).catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
