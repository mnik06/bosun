import { HttpError } from 'src/api/errors/HttpError';
import { type PendingUpgradesService } from 'src/services/sockets/pending-upgrades.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

// `force` arms the offer that this refresh will produce, rather than upgrading
// anything itself: the agent is told to re-announce, and the upgrade is decided
// on the `hello` that comes back.
export function refreshMachine(opts: {
	socketRegistry: SocketRegistry;
	pendingUpgrades: PendingUpgradesService;
	machine: Machine;
	force?: boolean;
}): void {
	if (opts.force === true) {
		opts.pendingUpgrades.force(opts.machine.id);
	}

	if (
		!opts.socketRegistry.sendToAgent({
			machineId: opts.machine.id,
			message: { type: 'refresh' }
		})
	) {
		throw new HttpError(409, 'machine offline');
	}
}
