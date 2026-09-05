import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine } from 'src/types/MachineSchema';

export async function listMachines(opts: { machineRepo: MachineRepo }): Promise<Machine[]> {
	return opts.machineRepo.listAll();
}
