import { type FastifyBaseLogger } from 'fastify';
import { sendUpgrade } from 'src/controllers/machines/shared/send-upgrade';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type AgentReleaseService } from 'src/services/agent-release/agent-release.service';
import { type AutoUpgradeRolloutService } from 'src/services/agent-release/auto-upgrade-rollout.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

const SWEEP_MS = 10 * 60 * 1000;
// A trickle, not a wave. A broken build takes minutes to show as broken — the
// agent's probation deadline, a rollback, a reconnect — and every machine offered
// it before then is a machine that goes through that. Capping each sweep keeps
// the halt ahead of most of the fleet.
export const MAX_OFFERS_PER_SWEEP = 2;

export interface AutoUpgradeDeps {
	machineRepo: MachineRepo;
	agentRelease: AgentReleaseService;
	autoUpgradeRollout: AutoUpgradeRolloutService;
	socketRegistry: SocketRegistry;
	log: Pick<FastifyBaseLogger, 'info' | 'error'>;
}

export async function sweepAutoUpgrades(deps: AutoUpgradeDeps): Promise<number> {
	const machines = await deps.machineRepo.listAutoUpgrading();
	let sent = 0;

	for (const machine of machines) {
		if (sent >= MAX_OFFERS_PER_SWEEP) {
			break;
		}

		const connected = deps.socketRegistry.getAgentSocket(machine.id) !== null;

		if (machine.agentVersion === null || !connected) {
			continue;
		}

		const target = await deps.agentRelease.target(machine.agentVersion);

		if (
			!target ||
			deps.autoUpgradeRollout.refusal({
				machineId: machine.id,
				version: target.version,
				pinned: deps.agentRelease.pinned
			}) !== null
		) {
			continue;
		}

		// Never forced: forcing clears a version the machine blocked after it failed
		// there, and that is a judgement only an operator gets to make.
		if (
			sendUpgrade({
				socketRegistry: deps.socketRegistry,
				machine,
				from: machine.agentVersion,
				target,
				force: false,
				trigger: 'auto',
				log: deps.log
			})
		) {
			deps.autoUpgradeRollout.markOffered({ machineId: machine.id, version: target.version });
			sent += 1;
		}
	}

	return sent;
}

// Safe as an in-process interval for the same reason as the other sweeps: the
// backend deploys `--ha=false`, and the sockets it offers over live in this
// process anyway.
export function startAutoUpgradeSweep(deps: AutoUpgradeDeps): () => void {
	const timer = setInterval(() => {
		sweepAutoUpgrades(deps).catch((error: unknown) => {
			deps.log.error({ error }, 'failed offering unattended agent upgrades');
		});
	}, SWEEP_MS);

	timer.unref();

	return () => {
		clearInterval(timer);
	};
}
