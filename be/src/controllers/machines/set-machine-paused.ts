import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { broadcastToUi, getAgentSocket, sendToAgent } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

// Resuming restores reachability, which is a property of the socket rather than
// of the row, so it is read back from the registry instead of assumed.
function resumedStatus(machineId: string): 'online' | 'offline' {
	const socket = getAgentSocket(machineId);

	return socket && socket.readyState === socket.OPEN ? 'online' : 'offline';
}

export async function setMachinePaused(opts: {
	machineRepo: MachineRepo;
	id: string;
	userId: string;
	paused: boolean;
}): Promise<Machine> {
	const machine = await opts.machineRepo.setOwnedStatus({
		id: opts.id,
		userId: opts.userId,
		status: opts.paused ? 'paused' : resumedStatus(opts.id)
	});

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	// Told, not left to infer it from silence: the agent's own log is where an
	// operator on the box looks to find out why it is doing nothing.
	sendToAgent({ machineId: machine.id, message: { type: opts.paused ? 'pause' : 'resume' } });
	broadcastToUi({ userId: machine.userId, message: { type: 'machine.updated', machine } });

	return machine;
}
