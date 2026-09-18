import { HttpError } from 'src/api/errors/HttpError';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type AzureWebhookSubscriptionRepo } from 'src/repos/azure/azure-webhook-subscription.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

// Deletes the stored token, every webhook subscription bosun created for its
// repositories from Azure itself (not only from bosun's database — AC-16), and
// cascades to the repositories it owns and, through the FK on `machines`, drops
// every machine's attachment (AC-17, AC-18). Azure-side deletion is best-effort
// (see `AzureDevOpsService.deleteSubscription`): the local disconnect always
// succeeds even if Azure refuses to drop an individual subscription.
export async function disconnectAzureOrganization(opts: {
	azureConnectionRepo: AzureConnectionRepo;
	azureWebhookSubscriptionRepo: AzureWebhookSubscriptionRepo;
	repositoryRepo: RepositoryRepo;
	machineRepo: MachineRepo;
	azureDevOps: AzureDevOpsService;
	patEncryption: PatEncryptionService;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
}): Promise<void> {
	const connection = await opts.azureConnectionRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	if (!connection) {
		throw new HttpError(404, 'Azure DevOps connection not found');
	}

	const repositories = await opts.repositoryRepo.listForAzureConnection(connection.id);
	const subscriptions = await opts.azureWebhookSubscriptionRepo.listForRepositoryIds(repositories.map((repository) => repository.id));

	if (subscriptions.length > 0) {
		const encryptedPat = await opts.azureConnectionRepo.getEncryptedPatById({ id: connection.id, projectId: opts.projectId });

		if (encryptedPat !== null) {
			const pat = opts.patEncryption.decrypt(encryptedPat);

			await Promise.all(
				subscriptions.map((subscription) =>
					opts.azureDevOps.deleteSubscription({ organization: connection.organization, pat, azureSubscriptionId: subscription.azureSubscriptionId })
				)
			);
		}
	}

	const affectedMachines = (
		await Promise.all(repositories.map((repository) => opts.machineRepo.listByRepository(repository.id)))
	).flat();

	const deleted = await opts.azureConnectionRepo.deleteOwned({ id: connection.id, projectId: opts.projectId });

	if (!deleted) {
		throw new HttpError(404, 'Azure DevOps connection not found');
	}

	for (const machine of affectedMachines) {
		const refreshed = await opts.machineRepo.getById(machine.id);

		if (refreshed) {
			announceMachine({ socketRegistry: opts.socketRegistry, machine: refreshed });
		}
	}
}
