import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { type ProjectProfile } from 'src/types/ProjectProfileSchema';

export async function saveProjectProfile(opts: {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
	projectProfile: ProjectProfile;
}): Promise<Machine> {
	const machine = await opts.machineRepo.saveProjectProfile({
		id: opts.id,
		userId: opts.userId,
		projectProfile: opts.projectProfile
	});

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	opts.socketRegistry.broadcastToUi({
		userId: opts.userId,
		message: { type: 'machine.updated', machine }
	});

	return machine;
}
