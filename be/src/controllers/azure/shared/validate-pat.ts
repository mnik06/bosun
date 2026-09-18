import { HttpError } from 'src/api/errors/HttpError';
import { toAzureHttpError } from 'src/controllers/azure/shared/azure-errors';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';

// The PAT is asked to list the organization's repositories before it is ever
// persisted — connect and rotate both fail the same way when it can't (AC-2,
// AC-6, AC-14).
export async function assertPatGrantsRepositories(azureDevOps: AzureDevOpsService, opts: { organization: string; pat: string }): Promise<void> {
	const repositories = await azureDevOps.listRepositories(opts).catch((error: unknown) => {
		throw toAzureHttpError(error);
	});

	if (repositories.length === 0) {
		throw new HttpError(400, 'No repositories are visible to this token');
	}
}
