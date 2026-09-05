import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine } from 'src/types/MachineSchema';

export async function getMachine(opts: {
	machineRepo: MachineRepo;
	id: string;
}): Promise<Machine> {
	const machine = await opts.machineRepo.getById(opts.id);

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	return machine;
}
