import { HttpError } from 'src/api/errors/HttpError';
import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Repository } from 'src/types/RepositorySchema';

export async function saveAutoResolve(opts: {
	repositoryRepo: RepositoryRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	autoResolveConflicts: boolean;
}): Promise<Repository> {
	const repository = await opts.repositoryRepo.saveAutoResolve(opts);

	if (!repository) {
		throw new HttpError(404, 'Repository not found');
	}

	announceRepository({ socketRegistry: opts.socketRegistry, repository });

	return repository;
}
