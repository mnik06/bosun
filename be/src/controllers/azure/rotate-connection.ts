import { HttpError } from 'src/api/errors/HttpError';
import { toAzureHttpError } from 'src/controllers/azure/shared/azure-errors';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type AzureConnection } from 'src/types/AzureSchema';

// Validated the same way a new connection is (AC-14), and nothing else about the
// connection changes: `azureConnectionRepo.rotatePat` touches only the PAT and
// clears a broken status, never the repositories or machines it owns (AC-15).
export async function rotateAzureConnection(opts: {
	azureConnectionRepo: AzureConnectionRepo;
	azureDevOps: AzureDevOpsService;
	patEncryption: PatEncryptionService;
	id: string;
	projectId: string;
	pat: string;
}): Promise<AzureConnection> {
	const connection = await opts.azureConnectionRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	if (!connection) {
		throw new HttpError(404, 'Azure DevOps connection not found');
	}

	const repositories = await opts.azureDevOps.listRepositories({ organization: connection.organization, pat: opts.pat }).catch((error: unknown) => {
		throw toAzureHttpError(error);
	});

	if (repositories.length === 0) {
		throw new HttpError(400, 'No repositories are visible to this token');
	}

	const rotated = await opts.azureConnectionRepo.rotatePat({
		id: connection.id,
		projectId: opts.projectId,
		encryptedPat: opts.patEncryption.encrypt(opts.pat)
	});

	return rotated ?? connection;
}
