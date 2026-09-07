import { holdConnection } from '../connection/socket';
import { type AgentConfig } from '../config/config';
import { getServices } from '../services/index';
import { UPGRADE_EXIT_CODE } from '../services/upgrade.service';
import { AGENT_VERSION } from '../version';

export async function run(opts: { config: AgentConfig; configPath: string }): Promise<never> {
	const services = getServices({ config: opts.config, env: process.env });

	// Before anything dials out. A machine has no inbound port, so a build that
	// cannot connect cannot be fixed from the browser — the only way back is for
	// the binary itself to notice it never got a connection and restore the one
	// that did.
	const rolledBack = services.upgrade.rollbackIfFailed(AGENT_VERSION);

	if (rolledBack !== null) {
		console.error(`upgrade to ${rolledBack} never connected — rolled back, restarting`);
		process.exit(UPGRADE_EXIT_CODE);
	}

	return holdConnection({
		config: opts.config,
		configPath: opts.configPath,
		services
	});
}
