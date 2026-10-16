import { repositoryCloning } from 'src/controllers/repositories/shared/config-for';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

// A machine that can take a session for this repository right now: online by its
// row, holding an open socket, and done cloning.
export async function firstOnlineMachine(
	deps: { machineRepo: MachineRepo; socketRegistry: SocketRegistry },
	repositoryId: string
): Promise<Machine | null> {
	const machines = await deps.machineRepo.listByRepository(repositoryId);

	return (
		machines.find(
			(machine) => machine.status === 'online' && !repositoryCloning(machine) && deps.socketRegistry.getAgentSocket(machine.id) !== null
		) ?? null
	);
}
