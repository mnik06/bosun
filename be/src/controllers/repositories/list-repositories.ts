import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type Repository } from 'src/types/RepositorySchema';

export async function listRepositories(opts: {
	repositoryRepo: RepositoryRepo;
	projectId: string;
}): Promise<Repository[]> {
	return opts.repositoryRepo.listForProject(opts.projectId);
}
