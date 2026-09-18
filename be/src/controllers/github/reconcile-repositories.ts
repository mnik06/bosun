import { type FastifyBaseLogger } from 'fastify';
import { pollGithubPatBranches } from 'src/controllers/github/poll-branches';
import { reconcileGithubWebhook } from 'src/controllers/github/shared/webhook';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';
import { type Repository } from 'src/types/RepositorySchema';

async function resolveConnectionAndPat(deps: LineDeps, repository: Repository): Promise<{ connection: GithubPatConnection; pat: string } | null> {
	if (repository.githubPatConnectionId === null) {
		return null;
	}

	const connection = await deps.githubPatConnectionRepo.getById(repository.githubPatConnectionId);

	if (!connection || connection.status === 'broken') {
		return null;
	}

	const encryptedToken = await deps.githubPatConnectionRepo.getEncryptedTokenById({ id: connection.id, projectId: connection.projectId });

	if (encryptedToken === null) {
		return null;
	}

	return { connection, pat: deps.patEncryption.decrypt(encryptedToken) };
}

// The GitHub PAT sibling to `reconcileAzureRepositories`, run on the same
// timer: every token-connected repository's webhook is health-checked
// (AC-38) and its branches polled (AC-39, AC-40) whether or not it currently
// has a working webhook. A repository whose connection is broken, rate-limited,
// or gone is skipped rather than failing every other one.
export async function reconcileGithubPatRepositories(deps: LineDeps, opts: { log: FastifyBaseLogger }): Promise<void> {
	for (const repository of await deps.repositoryRepo.listAllGithubPatConnected()) {
		try {
			const resolved = await resolveConnectionAndPat(deps, repository);

			if (!resolved) {
				continue;
			}

			const { connection, pat } = resolved;

			await reconcileGithubWebhook(deps, { repository, connection, pat });
			await pollGithubPatBranches(deps, { repository, connection, pat });
			await deps.repositoryRepo.markSynced(repository.id);
		} catch (error) {
			opts.log.warn({ error, repositoryId: repository.id }, 'could not sync a GitHub PAT-connected repository');
		}
	}
}
