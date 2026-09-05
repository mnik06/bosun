import crypto from 'crypto';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { hashMachineKey } from 'src/services/keys/key.service';

export async function authenticateAgent(opts: {
	machineRepo: MachineRepo;
	authorization?: string;
}): Promise<string | null> {
	const key = opts.authorization?.startsWith('Bearer ')
		? opts.authorization.slice('Bearer '.length)
		: null;

	if (!key) {
		return null;
	}

	const hash = hashMachineKey(key);
	const auth = await opts.machineRepo.findAuthByKeyHash(hash);

	if (!auth) {
		return null;
	}

	const matches = crypto.timingSafeEqual(
		Buffer.from(hash, 'hex'),
		Buffer.from(auth.machineKeyHash, 'hex')
	);

	return matches ? auth.id : null;
}
