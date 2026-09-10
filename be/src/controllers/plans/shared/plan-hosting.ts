import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

const REQUIRED_CHECKS = ['claude'];

function hostingRefusal(machine: Machine): string | null {
	if (machine.status === 'paused') {
		return 'this machine is paused';
	}

	if (machine.status !== 'online') {
		return 'this machine is offline';
	}

	if (!machine.capabilities) {
		return 'this machine has not reported preflight yet';
	}

	const failed = REQUIRED_CHECKS.filter(
		(name) => !machine.capabilities?.find((check) => check.name === name)?.ok
	);

	return failed.length > 0 ? `preflight is red: ${failed.join(', ')}` : null;
}

// Refused before anything is written, so a machine that cannot host a session
// does not leave a plan row behind that will sit in `planning` forever.
export async function requireHost(opts: {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	machineId: string;
	projectId: string;
}): Promise<Machine> {
	const machine = await opts.machineRepo.getOwnedById({
		id: opts.machineId,
		projectId: opts.projectId
	});

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	const refusal = hostingRefusal(machine);

	if (refusal) {
		throw new HttpError(409, refusal);
	}

	if (!opts.socketRegistry.getAgentSocket(machine.id)) {
		throw new HttpError(409, 'this machine is offline');
	}

	return machine;
}
