import crypto from 'crypto';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type KeyService } from 'src/services/keys/key.service';
import { readBearerToken } from 'src/utils/general';

export async function authenticateAgent(opts: {
	machineRepo: MachineRepo;
	keyService: KeyService;
	authorization?: string;
}): Promise<{ machineId: string; userId: string } | null> {
	const key = readBearerToken(opts.authorization);

	if (!key) {
		return null;
	}

	const hash = opts.keyService.hashMachineKey(key);
	const auth = await opts.machineRepo.findAuthByKeyHash(hash);

	if (!auth) {
		return null;
	}

	const matches = crypto.timingSafeEqual(
		Buffer.from(hash, 'hex'),
		Buffer.from(auth.machineKeyHash, 'hex')
	);

	return matches ? { machineId: auth.id, userId: auth.userId } : null;
}
