import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type KeyService } from 'src/services/keys/key.service';

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function createMachine(opts: {
	machineRepo: MachineRepo;
	idService: IdService;
	keyService: KeyService;
	projectId: string;
	name: string;
	serverUrl: string;
}) {
	const token = opts.keyService.generateEnrollmentToken();
	const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

	const machine = await opts.machineRepo.create({
		id: opts.idService.createMachineId(),
		projectId: opts.projectId,
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
