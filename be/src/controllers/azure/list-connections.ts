import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type AzureConnection } from 'src/types/AzureSchema';

export async function listAzureConnections(opts: { azureConnectionRepo: AzureConnectionRepo; projectId: string }): Promise<AzureConnection[]> {
	return opts.azureConnectionRepo.listForProject(opts.projectId);
}
