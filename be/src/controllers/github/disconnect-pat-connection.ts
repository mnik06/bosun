import { HttpError } from 'src/api/errors/HttpError';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

// Cascades to the repositories the connection owns and, through the FK on
// `machines`, drops every machine's attachment (AC-16's mirror for Azure).
// Every webhook this connection created on GitHub itself is deleted first
// (AC-18), best-effort like Azure's own subscription cleanup: a webhook GitHub
// refuses to delete is GitHub's own orphan, never a reason to fail the
// disconnect the leader asked for.
export async function disconnectGithubPatConnection(opts: {
	githubPatConnectionRepo: GithubPatConnectionRepo;
	repositoryRepo: RepositoryRepo;
	machineRepo: MachineRepo;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
}): Promise<void> {
	const connection = await opts.githubPatConnectionRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	if (!connection) {
		throw new HttpError(404, 'GitHub token connection not found');
	}

	const repositories = await opts.repositoryRepo.listForGithubPatConnection(connection.id);
	const encryptedToken = await opts.githubPatConnectionRepo.getEncryptedTokenById({ id: connection.id, projectId: opts.projectId });

	if (encryptedToken !== null) {
		const pat = opts.patEncryption.decrypt(encryptedToken);

		await Promise.all(
			repositories.map(async (repository) => {
				const webhookId = await opts.repositoryRepo.getGithubWebhookIdById(repository.id);

				if (webhookId !== null) {
					await opts.githubPat.deleteWebhook({ pat, fullName: repository.fullName, webhookId });
				}
			})
		);
	}

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
