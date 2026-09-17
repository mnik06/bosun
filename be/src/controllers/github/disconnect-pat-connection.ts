import { HttpError } from 'src/api/errors/HttpError';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

// Cascades to the repositories the connection owns and, through the FK on
// `machines`, drops every machine's attachment (AC-16's mirror for Azure).
// Deleting the webhook this connection may have created on GitHub itself is not
// done here — no PAT connection creates one yet (that lands with sync, bullet
// 3) — so there is nothing on GitHub's side to clean up before the local
// cascade.
export async function disconnectGithubPatConnection(opts: {
	githubPatConnectionRepo: GithubPatConnectionRepo;
	repositoryRepo: RepositoryRepo;
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
}): Promise<void> {
	const connection = await opts.githubPatConnectionRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	if (!connection) {
		throw new HttpError(404, 'GitHub token connection not found');
	}

	const repositories = await opts.repositoryRepo.listForGithubPatConnection(connection.id);
	const affectedMachines = (await Promise.all(repositories.map((repository) => opts.machineRepo.listByRepository(repository.id)))).flat();

	const deleted = await opts.githubPatConnectionRepo.deleteOwned({ id: connection.id, projectId: opts.projectId });

	if (!deleted) {
		throw new HttpError(404, 'GitHub token connection not found');
	}

	for (const machine of affectedMachines) {
		const refreshed = await opts.machineRepo.getById(machine.id);

		if (refreshed) {
			announceMachine({ socketRegistry: opts.socketRegistry, machine: refreshed });
		}
	}
}
