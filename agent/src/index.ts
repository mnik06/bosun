#!/usr/bin/env node
import path from 'path';
import { Command } from 'commander';
import { defaultConfigPath } from './config';
import { enroll } from './enroll';

const program = new Command();

program.name('bosun-agent').description('Bosun machine agent').version('1.0.0');

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

program.parseAsync(process.argv).catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
