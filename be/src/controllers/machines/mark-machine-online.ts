import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type EnvSetSummary } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';

export async function markMachineOnline(opts: {
	machineRepo: MachineRepo;
	id: string;
	agentVersion: string;
	repoPath?: string;
	publicKey?: string;
	envSets?: EnvSetSummary[];
	sessionSecrets?: string[];
}): Promise<{ machine: Machine; wasOnline: boolean } | null> {
	const result = await opts.machineRepo.markOnline({
		id: opts.id,
		agentVersion: opts.agentVersion,
		repoPath: opts.repoPath,
		publicKey: opts.publicKey,
		now: new Date()
	});

	if (!result) {
		return null;
	}

	let machine: Machine | null = result.machine;

	// Absent is an agent older than env sets, which cannot say what the machine
	// holds. Treating it as an empty list would erase the summary a newer agent
	// reported, while the values it describes are still on disk.
	if (machine && opts.envSets) {
		machine = await opts.machineRepo.saveEnvSets({ id: machine.id, envSets: opts.envSets });
	}

	if (machine && opts.sessionSecrets) {
		machine = await opts.machineRepo.saveSessionSecrets({ id: machine.id, sessionSecrets: opts.sessionSecrets });
	}

	return machine ? { machine, wasOnline: result.wasOnline } : null;
}
