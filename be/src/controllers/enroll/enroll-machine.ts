import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { generateMachineKey, hashMachineKey } from 'src/services/keys/key.service';

async function enrollmentRejection(opts: {
	machineRepo: MachineRepo;
	token: string;
}): Promise<HttpError> {
	const enrollment = await opts.machineRepo.findEnrollmentByToken(opts.token);

	if (!enrollment) {
		return new HttpError(400, 'Unknown enrollment code');
	}

	if (enrollment.tokenUsedAt) {
		return new HttpError(409, 'Enrollment code has already been used');
	}

	return new HttpError(410, 'Enrollment code has expired');
}

export async function enrollMachine(opts: {
	machineRepo: MachineRepo;
	token: string;
	repoPath: string;
	serverUrl: string;
}) {
	const now = new Date();
	const machineKey = generateMachineKey();
	const machine = await opts.machineRepo.consumeEnrollmentToken({
		token: opts.token,
		machineKeyHash: hashMachineKey(machineKey),
		repoPath: opts.repoPath,
		now
	});

	if (!machine) {
		throw await enrollmentRejection({ machineRepo: opts.machineRepo, token: opts.token });
	}

	return { machineId: machine.id, machineKey, serverUrl: opts.serverUrl };
}
