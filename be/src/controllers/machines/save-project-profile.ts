import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { type ProjectProfile } from 'src/types/ProjectProfileSchema';
import { orNotFound } from 'src/utils/general';

export async function saveProjectProfile(opts: {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	projectProfile: ProjectProfile;
}): Promise<Machine> {
	const machine = await orNotFound(
		opts.machineRepo.saveProjectProfile({
			id: opts.id,
			projectId: opts.projectId,
			projectProfile: opts.projectProfile
		}),
		'Machine not found'
	);

	announceMachine({ socketRegistry: opts.socketRegistry, machine });

	return machine;
}
