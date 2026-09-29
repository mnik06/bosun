import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';

export interface RepositoryConfig {
	config: string | null;
}

export async function getRepositoryConfig(opts: {
	repositoryRepo: RepositoryRepo;
	id: string;
	projectId: string;
}): Promise<RepositoryConfig> {
	const repository = await getOwnedRepository(opts);

	return { config: repository.config };
}
