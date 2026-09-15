import { HttpError } from 'src/api/errors/HttpError';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { type ProjectProfile } from 'src/types/ProjectProfileSchema';

export async function saveProjectProfile(opts: {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	projectProfile: ProjectProfile;
}): Promise<Machine> {
	const machine = await opts.machineRepo.saveProjectProfile({
		id: opts.id,
		projectId: opts.projectId,
		projectProfile: opts.projectProfile
	});

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	announceMachine({ socketRegistry: opts.socketRegistry, machine });

	return machine;
}
