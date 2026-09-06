import { HttpError } from 'src/api/errors/HttpError';
import { sendToAgent } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

export function refreshMachine(opts: { machine: Machine }): void {
	if (!sendToAgent({ machineId: opts.machine.id, message: { type: 'refresh' } })) {
		throw new HttpError(409, 'machine offline');
	}
}
