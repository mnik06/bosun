import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { type Repository } from 'src/types/RepositorySchema';

export function announceMachine(opts: { socketRegistry: SocketRegistry; machine: Machine }): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.machine.projectId,
		message: { type: 'machine.updated', machine: opts.machine }
	});
}

// The disconnect tail every provider's connection-delete shares: every machine
// attached to one of the connection's repositories, gathered before the
// connection row is deleted while those repository ids are still there to ask.
export async function listAffectedMachines(deps: { machineRepo: MachineRepo }, repositories: Repository[]): Promise<Machine[]> {
	return (await Promise.all(repositories.map((repository) => deps.machineRepo.listByRepository(repository.id)))).flat();
}

// Re-fetches each machine after the delete has committed, since the delete may
// have cascaded its `repositoryId` away, and announces only the ones still
// there — a machine removed some other way in between needs no broadcast.
export async function announceMachines(deps: { machineRepo: MachineRepo; socketRegistry: SocketRegistry }, machines: Machine[]): Promise<void> {
	for (const machine of machines) {
		const refreshed = await deps.machineRepo.getById(machine.id);

		if (refreshed) {
			announceMachine({ socketRegistry: deps.socketRegistry, machine: refreshed });
		}
	}
}
