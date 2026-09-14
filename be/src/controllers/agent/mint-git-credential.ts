import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';

// No repository argument, on purpose: the answer is for the repository the
// calling machine is attached to, so there is nothing a session on the box could
// ask for that would reach somebody else's.
export async function mintGitCredential(opts: {
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	githubApp: GithubAppService;
	machineId: string;
}): Promise<{ token: string; expiresAt: Date }> {
	const machine = await opts.machineRepo.getById(opts.machineId);

	if (!machine?.repositoryId) {
		throw new HttpError(403, 'This machine has no repository attached, so bosun holds no credential for it');
	}

	const repository = await opts.repositoryRepo.getById(machine.repositoryId);
	const installation = repository ? await opts.githubInstallationRepo.getById(repository.installationId) : null;

	if (!repository || !installation) {
		throw new HttpError(403, 'The repository this machine was attached to is no longer connected');
	}

	try {
		return await opts.githubApp.repositoryToken({
			installationId: installation.installationId,
			githubRepoId: repository.githubRepoId
		});
	} catch (error) {
		throw toGithubHttpError(error);
	}
}
