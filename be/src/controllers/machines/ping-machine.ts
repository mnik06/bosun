import { HttpError } from 'src/api/errors/HttpError';
import { type IdService } from 'src/services/ids/id.service';
import { type PendingPingsService } from 'src/services/sockets/pending-pings.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

export function pingMachine(opts: {
	idService: IdService;
	pendingPings: PendingPingsService;
	socketRegistry: SocketRegistry;
	machine: Machine;
}): { commandId: string } {
	// Checked before reachability: a paused machine may well be connected, and
	// "machine offline" would send the operator looking at the wrong thing.
	if (opts.machine.status === 'paused') {
		throw new HttpError(409, 'machine paused');
	}

	const commandId = opts.idService.createCommandId();

	opts.pendingPings.record({ commandId, machineId: opts.machine.id, sentAt: Date.now() });

	if (
		!opts.socketRegistry.sendToAgent({
			machineId: opts.machine.id,
			message: { type: 'ping', id: commandId }
		})
	) {
		throw new HttpError(409, 'machine offline');
	}

	return { commandId };
}
