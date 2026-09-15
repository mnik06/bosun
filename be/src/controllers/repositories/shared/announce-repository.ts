import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Repository } from 'src/types/RepositorySchema';
import { orNotFound } from 'src/utils/general';

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
	return orNotFound(opts.repositoryRepo.getOwnedById({ id: opts.id, projectId: opts.projectId }), 'Repository not found');
}
