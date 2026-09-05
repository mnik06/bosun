import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type Machine, type PreflightCheck } from 'src/types/MachineSchema';

export async function saveMachinePreflight(opts: {
	machineRepo: MachineRepo;
	id: string;
	checks: PreflightCheck[];
}): Promise<Machine | null> {
	return opts.machineRepo.saveCapabilities({
		id: opts.id,
		checks: opts.checks,
		now: new Date()
	});
}
