import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type AvailableAzureRepository } from 'src/types/AzureSchema';

// Exactly what every connected organization's PAT grants, asked of Azure each
// time — a repository the token can no longer see disappears here without
// bosun having to hear about it, the same rule `listAvailableRepositories`
// (GitHub) follows. A connection with a broken token is skipped rather than
// failing the whole picker for every other organization.
export async function listAvailableAzureRepositories(opts: {
	azureConnectionRepo: AzureConnectionRepo;
	azureDevOps: AzureDevOpsService;
	patEncryption: PatEncryptionService;
	projectId: string;
}): Promise<AvailableAzureRepository[]> {
	const connections = await opts.azureConnectionRepo.listForProject(opts.projectId);
	const active = connections.filter((connection) => connection.status === 'active');

	const granted = await Promise.all(
		active.map(async (connection) => {
			const encryptedPat = await opts.azureConnectionRepo.getEncryptedPatById({ id: connection.id, projectId: opts.projectId });

			if (encryptedPat === null) {
				return [];
			}

			const pat = opts.patEncryption.decrypt(encryptedPat);

			try {
				const repositories = await opts.azureDevOps.listRepositories({ organization: connection.organization, pat });

				return repositories.map((repo) => ({ ...repo, azureConnectionId: connection.id }));
			} catch {
				return [];
			}
		})
	);

	return granted.flat().sort((a, b) => a.fullName.localeCompare(b.fullName));
}
