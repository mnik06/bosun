import { HttpError } from 'src/api/errors/HttpError';
import { listAvailableRepositories } from 'src/controllers/github/list-available-repositories';
import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Repository } from 'src/types/RepositorySchema';

// Resolved against what the project's installations grant rather than trusted
// from the body, so a repository id nobody granted cannot be added by typing it.
export async function addRepository(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	repositoryRepo: RepositoryRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	projectId: string;
	githubRepoId: number;
}): Promise<Repository> {
	const available = await listAvailableRepositories(opts);
	const granted = available.find((repo) => repo.githubRepoId === opts.githubRepoId);

	if (!granted) {
		throw new HttpError(404, 'No installation connected to this project grants that repository');
	}

	const repository = await opts.repositoryRepo.create({
		id: opts.idService.createRepositoryId(),
		projectId: opts.projectId,
		installationId: granted.installationId,
		githubRepoId: granted.githubRepoId,
		fullName: granted.fullName,
		defaultBranch: granted.defaultBranch
	});

	if (!repository) {
		throw new HttpError(409, `${granted.fullName} is already added to this project`);
	}

	announceRepository({ socketRegistry: opts.socketRegistry, repository });

	return repository;
}
