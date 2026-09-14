import { holdConnection } from '../connection/socket';
import { type AgentConfig } from '../config/config';
import { getServices } from '../services/index';
import { PROBATION_DEADLINE_MS, UPGRADE_EXIT_CODE } from '../services/upgrade.service';
import { AGENT_VERSION } from '../version';

export async function run(opts: { config: AgentConfig; configPath: string }): Promise<never> {
	const services = getServices({ config: opts.config, configPath: opts.configPath, env: process.env });

	// Before anything dials out. A machine has no inbound port, so a build that
	// cannot connect cannot be fixed from the browser — the only way back is for
	// the binary itself to notice it never got a connection and restore the one
	// that did.
	const rolledBack = services.upgrade.rollbackIfFailed(AGENT_VERSION);

	if (rolledBack !== null) {
		console.error(`upgrade to ${rolledBack} never connected — rolled back, restarting`);
		process.exit(UPGRADE_EXIT_CODE);
	}

	// Rolling back needs a second boot to notice the first one failed, and a build
	// that starts cleanly but can never reach bosun would otherwise retry forever
	// and never get one. The deadline turns "still not connected" into that boot.
	if (services.upgrade.underProbation()) {
		setTimeout(() => {
			if (!services.upgrade.underProbation()) {
				return;
			}

			console.error(
				`upgrade to ${AGENT_VERSION} has not connected in ${PROBATION_DEADLINE_MS / 1000}s — restarting to roll it back`
			);
			process.exit(1);
		}, PROBATION_DEADLINE_MS).unref();
	}

	// Before the first bullet can arrive, so none starts without knowing whether it
	// can be limited. Orphans are reaped while this process holds no session of its
	// own, which is the only moment stopping every `bosun-run-*` scope is safe.
	await services.memory.load();
	await services.memory.reapOrphans();

	if (services.memory.previousExit() === 'oom-kill') {
		console.error('the previous agent process was killed by the kernel for running out of memory');
	}

	return holdConnection({
		config: opts.config,
		configPath: opts.configPath,
		services
	});
}
