import { HttpError } from 'src/api/errors/HttpError';
import { createCommandId } from 'src/services/ids/id.service';
import { recordPing } from 'src/services/sockets/pending-pings.service';
import { getAgentSocket } from 'src/services/sockets/registry.service';

export function pingMachine(opts: { id: string }): { commandId: string } {
	const socket = getAgentSocket(opts.id);

	if (!socket || socket.readyState !== socket.OPEN) {
		throw new HttpError(409, 'machine offline');
	}

	const commandId = createCommandId();

	recordPing({ commandId, machineId: opts.id, sentAt: Date.now() });
	socket.send(JSON.stringify({ type: 'ping', id: commandId }));

	return { commandId };
}
