import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type ClaudeAuthMode, type Machine, type PreflightCheck } from 'src/types/MachineSchema';

export async function saveMachinePreflight(opts: {
	machineRepo: MachineRepo;
	id: string;
	checks: PreflightCheck[];
	claudeAuthMode: ClaudeAuthMode | null;
}): Promise<Machine | null> {
	return opts.machineRepo.saveCapabilities({
		id: opts.id,
		checks: opts.checks,
		claudeAuthMode: opts.claudeAuthMode,
		now: new Date()
	});
}
