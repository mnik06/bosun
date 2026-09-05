import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { createMachineId } from 'src/services/ids/id.service';
import { generateEnrollmentToken } from 'src/services/keys/key.service';

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function createMachine(opts: {
	machineRepo: MachineRepo;
	name: string;
	serverUrl: string;
}) {
	const token = generateEnrollmentToken();
	const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
	const machine = await opts.machineRepo.create({
		id: createMachineId(),
		name: opts.name,
		enrollmentToken: token,
		tokenExpiresAt
	});

	return {
		id: machine.id,
		name: machine.name,
		token,
		expiresAt: tokenExpiresAt,
		enrollCommand: `bosun-agent enroll --server ${opts.serverUrl} --token ${token}`,
		installCommand: `curl -fsSL ${opts.serverUrl}/install.sh | BOSUN_TOKEN=${token} sh`
	};
}
