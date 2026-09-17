import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { orNotFound } from 'src/utils/general';

// Resuming restores reachability, which is a property of the socket rather than
// of the row, so it is read back from the registry instead of assumed.
function resumedStatus(opts: {
	socketRegistry: SocketRegistry;
	machineId: string;
}): 'online' | 'offline' {
	const socket = opts.socketRegistry.getAgentSocket(opts.machineId);

	return socket && socket.readyState === socket.OPEN ? 'online' : 'offline';
}

export async function setMachinePaused(opts: {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	paused: boolean;
}): Promise<Machine> {
	const machine = await orNotFound(
		opts.machineRepo.setOwnedStatus({
			id: opts.id,
			projectId: opts.projectId,
			status: opts.paused
				? 'paused'
				: resumedStatus({ socketRegistry: opts.socketRegistry, machineId: opts.id })
		}),
		'Machine not found'
	);

	// Told, not left to infer it from silence: the agent's own log is where an
	// operator on the box looks to find out why it is doing nothing.
	opts.socketRegistry.sendToAgent({
		machineId: machine.id,
		message: { type: opts.paused ? 'pause' : 'resume' }
	});
	announceMachine({ socketRegistry: opts.socketRegistry, machine });

	return machine;
}
