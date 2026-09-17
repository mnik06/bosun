import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type KeyService } from 'src/services/keys/key.service';
import { hexDigestsEqual, readBearerToken } from 'src/utils/general';

export async function authenticateAgent(opts: {
	machineRepo: MachineRepo;
	keyService: KeyService;
	authorization?: string;
}): Promise<{ machineId: string; projectId: string } | null> {
	const key = readBearerToken(opts.authorization);

	if (!key) {
		return null;
	}

	const hash = opts.keyService.hashMachineKey(key);
	const auth = await opts.machineRepo.findAuthByKeyHash(hash);

	if (!auth) {
		return null;
	}

	return hexDigestsEqual(hash, auth.machineKeyHash) ? { machineId: auth.id, projectId: auth.projectId } : null;
}
