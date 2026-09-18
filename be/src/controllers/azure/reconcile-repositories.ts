import { type FastifyBaseLogger } from 'fastify';
import { pollAzureBranches } from 'src/controllers/azure/poll-branches';
import { reconcileAzureWebhookSubscriptions } from 'src/controllers/azure/shared/webhook-subscriptions';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { type AzureConnection } from 'src/types/AzureSchema';
import { type Repository } from 'src/types/RepositorySchema';

async function resolveConnectionAndPat(deps: LineDeps, repository: Repository): Promise<{ connection: AzureConnection; pat: string } | null> {
	if (repository.azureConnectionId === null) {
		return null;
	}

	const connection = await deps.azureConnectionRepo.getById(repository.azureConnectionId);

	if (!connection || connection.status === 'broken') {
		return null;
	}

	const encryptedPat = await deps.azureConnectionRepo.getEncryptedPatById({ id: connection.id, projectId: connection.projectId });

	if (encryptedPat === null) {
		return null;
	}

	return { connection, pat: deps.patEncryption.decrypt(encryptedPat) };
}

// The sibling to `reconcilePullRequests`, run on the same timer rather than a
// second one: every Azure repository gets its webhook subscriptions' health
// checked (AC-64) and its branches polled (AC-66, AC-67), whether or not it
// currently has working webhooks. A repository whose connection is broken,
// rate-limited, or gone is skipped rather than failing every other one.
export async function reconcileAzureRepositories(deps: LineDeps, opts: { log: FastifyBaseLogger }): Promise<void> {
	for (const repository of await deps.repositoryRepo.listAllAzure()) {
		try {
			const resolved = await resolveConnectionAndPat(deps, repository);

			if (!resolved) {
				continue;
			}

			const { connection, pat } = resolved;

			await reconcileAzureWebhookSubscriptions(deps, { repository, connection, pat });
			await pollAzureBranches(deps, { repository, connection, pat });
			await deps.repositoryRepo.markSynced(repository.id);
		} catch (error) {
			opts.log.warn({ error, repositoryId: repository.id }, 'could not sync an Azure repository');
		}
	}
}
