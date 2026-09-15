import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine } from 'src/types/MachineSchema';
import { orNotFound } from 'src/utils/general';

// 404 rather than 403 for a machine owned by somebody else: a 403 confirms
// the row exists, which is what turns id guessing into a discovery tool.
export async function getMachine(opts: {
	machineRepo: MachineRepo;
	id: string;
	projectId: string;
}): Promise<Machine> {
	return orNotFound(opts.machineRepo.getOwnedById({ id: opts.id, projectId: opts.projectId }), 'Machine not found');
}
