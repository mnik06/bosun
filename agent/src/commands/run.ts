import { holdConnection } from '../connection/socket';
import { type AgentConfig } from '../config/config';
import { getServices } from '../services/index';

export async function run(opts: { config: AgentConfig; configPath: string }): Promise<never> {
	return holdConnection({
		config: opts.config,
		configPath: opts.configPath,
		services: getServices({ config: opts.config, env: process.env })
	});
}
