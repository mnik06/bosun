import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

const SHUTDOWN_REASON = 'this machine was deleted in bosun';

export async function deleteMachine(opts: {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
}): Promise<void> {
	// The scoped delete is the authorization check. Nothing is sent to any agent
	// before it succeeds, or a caller could shut down a machine they do not own
	// and still be told 404.
	if (!(await opts.machineRepo.deleteOwned({ id: opts.id, projectId: opts.projectId }))) {
		throw new HttpError(404, 'Machine not found');
	}

	const socket = opts.socketRegistry.getAgentSocket(opts.id);

	// Fire-and-forget: waiting for the agent to confirm would hang this request
	// for exactly the machine most likely to be off the network already. An agent
	// that never receives it terminates itself on the 401 it gets when it next
	// reconnects, which is what makes a missed frame self-correcting.
	opts.socketRegistry.sendToAgent({
		machineId: opts.id,
		message: { type: 'shutdown', reason: SHUTDOWN_REASON }
	});

	if (socket) {
		// Unregistered before closing, so a ping racing this delete cannot find a
		// socket for a machine whose row is already gone. `close` rather than
		// `terminate` because the shutdown frame still has to be flushed.
		opts.socketRegistry.unregisterAgentSocket({ machineId: opts.id, socket });
		socket.close();
	}

	opts.socketRegistry.broadcastToUi({
		projectId: opts.projectId,
		message: { type: 'machine.deleted', machineId: opts.id }
	});
}
