import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine } from 'src/types/MachineSchema';

export async function getMachine(opts: {
	machineRepo: MachineRepo;
	id: string;
	projectId: string;
}): Promise<Machine> {
	const machine = await opts.machineRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	// 404 rather than 403 for a machine owned by somebody else: a 403 confirms
	// the row exists, which is what turns id guessing into a discovery tool.
	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	return machine;
}
