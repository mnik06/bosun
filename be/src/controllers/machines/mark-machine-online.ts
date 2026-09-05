import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine } from 'src/types/MachineSchema';

export async function markMachineOnline(opts: {
	machineRepo: MachineRepo;
	id: string;
	agentVersion: string;
	repoPath: string;
}): Promise<Machine | null> {
	return opts.machineRepo.markOnline({
		id: opts.id,
		agentVersion: opts.agentVersion,
		repoPath: opts.repoPath,
		now: new Date()
	});
}
