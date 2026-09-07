import { HttpError } from 'src/api/errors/HttpError';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

export function refreshMachine(opts: { socketRegistry: SocketRegistry; machine: Machine }): void {
	if (
		!opts.socketRegistry.sendToAgent({
			machineId: opts.machine.id,
			message: { type: 'refresh' }
		})
	) {
		throw new HttpError(409, 'machine offline');
	}
}
