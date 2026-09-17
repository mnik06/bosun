import { HttpError } from 'src/api/errors/HttpError';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GitProvider } from 'src/services/git/git-provider';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type Repository } from 'src/types/RepositorySchema';

function githubProvider(opts: { githubApp: GithubAppService; installationId: number; githubRepoId: number }): GitProvider {
	const { githubApp, installationId, githubRepoId } = opts;

	return {
		getRepository: () => githubApp.getRepository({ installationId, githubRepoId }),
		readFile: (fileOpts) => githubApp.readFile({ installationId, githubRepoId, ...fileOpts }),
		proposeFile: (fileOpts) => githubApp.proposeFile({ installationId, githubRepoId, ...fileOpts }),
		pointBranch: (branchOpts) => githubApp.pointBranch({ installationId, githubRepoId, ...branchOpts }),
		openOrUpdatePullRequest: (prOpts) => githubApp.openOrUpdatePullRequest({ installationId, githubRepoId, ...prOpts }),
		getPullRequest: (prOpts) => githubApp.getPullRequest({ installationId, githubRepoId, ...prOpts }),
		editPullRequest: (prOpts) => githubApp.editPullRequest({ installationId, githubRepoId, ...prOpts }),
		repositoryToken: () => githubApp.repositoryToken({ installationId, githubRepoId })
	};
}

// Azure's pull-request/branch/file operations are a later bullet's build — this
// one only wires the resolver and the repository lookup real callers can already
// use. Every other operation throws rather than pretending to work.
function azureNotBuilt(operation: string): () => Promise<never> {
	return () => Promise.reject(new HttpError(501, `Azure DevOps repositories do not support ${operation} yet`));
}

function azureProvider(opts: { azureDevOps: AzureDevOpsService; organization: string; pat: string; azureProjectId: string; azureRepoId: string }): GitProvider {
	return {
		getRepository: () => opts.azureDevOps.getRepository(opts),
		readFile: azureNotBuilt('reading a file'),
		proposeFile: azureNotBuilt('proposing a file'),
		pointBranch: azureNotBuilt('pointing a branch'),
		openOrUpdatePullRequest: azureNotBuilt('opening a pull request'),
		getPullRequest: azureNotBuilt('reading a pull request'),
		editPullRequest: azureNotBuilt('editing a pull request'),
		repositoryToken: azureNotBuilt('minting a repository token')
	};
}

export interface GitProviderResolverDeps {
	githubInstallationRepo: GithubInstallationRepo;
	azureConnectionRepo: AzureConnectionRepo;
	githubApp: GithubAppService;
	azureDevOps: AzureDevOpsService;
	patEncryption: PatEncryptionService;
}

// Resolves the `GitProvider` for one already-attached repository, from
// `repository.provider` alone — the seam the line's GitHub-only callers move
// onto as they are migrated. A repository whose connection is gone or broken
// refuses here rather than at the first call the caller happens to make.
export async function gitProviderFor(deps: GitProviderResolverDeps, repository: Repository): Promise<GitProvider> {
	if (repository.provider === 'github') {
		const installation = repository.installationId === null ? null : await deps.githubInstallationRepo.getById(repository.installationId);

		if (!installation || repository.githubRepoId === null) {
			throw new HttpError(409, 'The GitHub installation this repository came from is no longer connected');
		}

		return githubProvider({ githubApp: deps.githubApp, installationId: installation.installationId, githubRepoId: repository.githubRepoId });
	}

	const connection = repository.azureConnectionId === null ? null : await deps.azureConnectionRepo.getById(repository.azureConnectionId);

	if (!connection || repository.azureProjectId === null || repository.azureRepoId === null) {
		throw new HttpError(409, 'The Azure DevOps organization this repository came from is no longer connected');
	}

	if (connection.status === 'broken') {
		throw new HttpError(409, "This Azure DevOps connection's token is broken — replace it in Settings before bosun can reach this repository");
	}

	const encryptedPat = await deps.azureConnectionRepo.getEncryptedPatById({ id: connection.id, projectId: connection.projectId });

	if (encryptedPat === null) {
		throw new HttpError(409, 'The Azure DevOps organization this repository came from is no longer connected');
	}

	return azureProvider({
		azureDevOps: deps.azureDevOps,
		organization: connection.organization,
		pat: deps.patEncryption.decrypt(encryptedPat),
		azureProjectId: repository.azureProjectId,
		azureRepoId: repository.azureRepoId
	});
}
