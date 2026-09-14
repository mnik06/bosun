import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { HttpError } from 'src/api/errors/HttpError';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Repository } from 'src/types/RepositorySchema';

export function announceRepository(opts: { socketRegistry: SocketRegistry; repository: Repository }): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.repository.projectId,
		message: { type: 'repository.updated', repository: opts.repository }
	});
}

export async function getOwnedRepository(opts: {
	repositoryRepo: RepositoryRepo;
	id: string;
	projectId: string;
}): Promise<Repository> {
	const repository = await opts.repositoryRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	if (!repository) {
		throw new HttpError(404, 'Repository not found');
	}

	return repository;
}
