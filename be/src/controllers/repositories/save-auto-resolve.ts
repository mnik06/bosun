import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Repository } from 'src/types/RepositorySchema';
import { orNotFound } from 'src/utils/general';

export async function saveAutoResolve(opts: {
	repositoryRepo: RepositoryRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	autoResolveConflicts: boolean;
}): Promise<Repository> {
	const repository = await orNotFound(opts.repositoryRepo.saveAutoResolve(opts), 'Repository not found');

	announceRepository({ socketRegistry: opts.socketRegistry, repository });

	return repository;
}
