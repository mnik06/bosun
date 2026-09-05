import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine } from 'src/types/MachineSchema';

export async function markMachineOffline(opts: {
	machineRepo: MachineRepo;
	id: string;
}): Promise<Machine | null> {
	return opts.machineRepo.markOffline({ id: opts.id, now: new Date() });
}
