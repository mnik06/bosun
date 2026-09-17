import { HttpError } from 'src/api/errors/HttpError';
import { assertPatGrantsRepositories } from 'src/controllers/azure/shared/validate-pat';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type IdService } from 'src/services/ids/id.service';
import { normalizeAzureOrganization, type AzureConnection } from 'src/types/AzureSchema';

// Validated before it is ever written: the PAT is asked to list the
// organization's repositories, and the connection is persisted only if that
// call succeeds and finds at least one (AC-2, AC-6).
export async function connectAzureOrganization(opts: {
	azureConnectionRepo: AzureConnectionRepo;
	azureDevOps: AzureDevOpsService;
	patEncryption: PatEncryptionService;
	idService: IdService;
	userId: string;
	projectId: string;
	organization: string;
	pat: string;
}): Promise<AzureConnection> {
	const organization = normalizeAzureOrganization(opts.organization);

	if (organization === null) {
		throw new HttpError(
			400,
			'Enter an organization name, a https://dev.azure.com/{org} URL, or a https://{org}.visualstudio.com URL'
		);
	}

	const existing = await opts.azureConnectionRepo.getByOrganization({ projectId: opts.projectId, organization });

	if (existing) {
		throw new HttpError(409, 'This organization is already connected.');
	}

	await assertPatGrantsRepositories(opts.azureDevOps, { organization, pat: opts.pat });

	return opts.azureConnectionRepo.create({
		id: opts.idService.createAzureConnectionId(),
		projectId: opts.projectId,
		organization,
		encryptedPat: opts.patEncryption.encrypt(opts.pat),
		createdByUserId: opts.userId
	});
}
