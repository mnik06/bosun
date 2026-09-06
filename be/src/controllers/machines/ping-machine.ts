import { HttpError } from 'src/api/errors/HttpError';
import { createCommandId } from 'src/services/ids/id.service';
import { recordPing } from 'src/services/sockets/pending-pings.service';
import { sendToAgent } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

export function pingMachine(opts: { machine: Machine }): { commandId: string } {
	// Checked before reachability: a paused machine may well be connected, and
	// "machine offline" would send the operator looking at the wrong thing.
	if (opts.machine.status === 'paused') {
		throw new HttpError(409, 'machine paused');
	}

	const commandId = createCommandId();

	recordPing({ commandId, machineId: opts.machine.id, sentAt: Date.now() });

	if (!sendToAgent({ machineId: opts.machine.id, message: { type: 'ping', id: commandId } })) {
		throw new HttpError(409, 'machine offline');
	}

	return { commandId };
}
