import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubAppService } from 'src/services/github/github-app.service';

// A GitHub installation token is short-lived by design; an Azure PAT is not, so
// "minting" one is just decrypting what is already stored. This is only a
// placeholder for the response shape the two providers share — nothing here
// actually expires the PAT.
const AZURE_CREDENTIAL_TTL_MS = 60 * 60 * 1000;

// No repository argument, on purpose: the answer is for the repository the
// calling machine is attached to, so there is nothing a session on the box could
// ask for that would reach somebody else's. Provider-agnostic beyond that one
// branch: whichever host the calling machine's repository belongs to, the token
// it gets back is scoped to that repository alone.
export async function mintGitCredential(opts: {
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	azureConnectionRepo: AzureConnectionRepo;
	githubApp: GithubAppService;
	patEncryption: PatEncryptionService;
	machineId: string;
}): Promise<{ token: string; expiresAt: Date }> {
	const machine = await opts.machineRepo.getById(opts.machineId);

	if (!machine?.repositoryId) {
		throw new HttpError(403, 'This machine has no repository attached, so bosun holds no credential for it');
	}

	const repository = await opts.repositoryRepo.getById(machine.repositoryId);

	if (!repository) {
		throw new HttpError(403, 'The repository this machine was attached to is no longer connected');
	}

	if (repository.provider === 'azure_devops') {
		const encryptedPat = repository.azureConnectionId
			? await opts.azureConnectionRepo.getEncryptedPatById({ id: repository.azureConnectionId, projectId: repository.projectId })
			: null;

		if (encryptedPat === null) {
			throw new HttpError(403, 'The repository this machine was attached to is no longer connected');
		}

		return { token: opts.patEncryption.decrypt(encryptedPat), expiresAt: new Date(Date.now() + AZURE_CREDENTIAL_TTL_MS) };
	}

	const installation = repository.installationId ? await opts.githubInstallationRepo.getById(repository.installationId) : null;

	if (!installation) {
		throw new HttpError(403, 'The repository this machine was attached to is no longer connected');
	}

	try {
		return await opts.githubApp.repositoryToken({
			installationId: installation.installationId,
			// `installation` resolving means this repository is a GitHub one, so its
			// `githubRepoId` is set too.
			githubRepoId: repository.githubRepoId!
		});
	} catch (error) {
		throw toGithubHttpError(error);
	}
}
