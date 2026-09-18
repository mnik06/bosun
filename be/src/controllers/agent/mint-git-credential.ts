import { HttpError } from 'src/api/errors/HttpError';
import { resolveGithubToken } from 'src/controllers/github/shared/resolve-github-token';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubAppService } from 'src/services/github/github-app.service';

// An Azure PAT exposes no per-request expiry, so "minting" one is just
// decrypting what is already stored — this is a placeholder for the response
// shape, nothing here actually expires the PAT.
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
	githubPatConnectionRepo: GithubPatConnectionRepo;
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

	return resolveGithubToken(repository, opts);
}
