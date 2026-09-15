import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

export function announceMachine(opts: { socketRegistry: SocketRegistry; machine: Machine }): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.machine.projectId,
		message: { type: 'machine.updated', machine: opts.machine }
	});
}
