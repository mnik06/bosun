import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';

export interface RepositoryConfig {
	config: string | null;
	instructions: string | null;
	stale: boolean;
}

export async function getRepositoryConfig(opts: {
	repositoryRepo: RepositoryRepo;
	id: string;
	projectId: string;
}): Promise<RepositoryConfig> {
	const repository = await getOwnedRepository(opts);

	return {
		config: repository.config,
		instructions: repository.instructions,
		stale: repository.instructions !== null && repository.instructions !== repository.configCompiledFrom
	};
}
