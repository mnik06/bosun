import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine } from 'src/types/MachineSchema';

export async function listMachines(opts: {
	machineRepo: MachineRepo;
	userId: string;
}): Promise<Machine[]> {
	return opts.machineRepo.listOwned(opts.userId);
}
