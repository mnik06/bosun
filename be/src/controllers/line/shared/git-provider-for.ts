import { type FastifyInstance } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';
import { clip } from 'src/controllers/line/shared/pull-request-body';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GitProvider } from 'src/services/git/git-provider';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type Repository } from 'src/types/RepositorySchema';

// The ticket's own "reportedly 4000" figure, named so a corrected live figure is
// a one-line change. GitHub's body is already clipped to its own, far larger
// limit by `pullRequestBody()`; this clips that output a second time, and
// `clip()`'s head-preserving truncation keeps the plan-link line — always near
// the top of the body — intact either way (AC-51).
const AZURE_MAX_PR_BODY = 4_000;

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

// `mint-git-credential.ts` decrypts an Azure connection's PAT directly rather
// than going through this seam — an Azure PAT has no per-repository mint step
// the way a GitHub installation token does, so there is nothing for
// `repositoryToken` to do here. Left unimplemented rather than removed, so the
// `GitProvider` interface still names every operation a future caller might
// reasonably expect of it.
function azureNotBuilt(operation: string): () => Promise<never> {
	return () => Promise.reject(new HttpError(501, `Azure DevOps repositories do not support ${operation} yet`));
}

function azureProvider(opts: { azureDevOps: AzureDevOpsService; organization: string; pat: string; azureProjectId: string; azureRepoId: string }): GitProvider {
	const { azureDevOps, ...scope } = opts;

	return {
		getRepository: () => azureDevOps.getRepository(scope),
		readFile: (fileOpts) => azureDevOps.readFile({ ...scope, ...fileOpts }),
		proposeFile: (fileOpts) => azureDevOps.proposeFile({ ...scope, ...fileOpts, body: clip(fileOpts.body, AZURE_MAX_PR_BODY) }),
		pointBranch: (branchOpts) => azureDevOps.pointBranch({ ...scope, ...branchOpts }),
		openOrUpdatePullRequest: (prOpts) => azureDevOps.openOrUpdatePullRequest({ ...scope, ...prOpts, body: clip(prOpts.body, AZURE_MAX_PR_BODY) }),
		getPullRequest: (prOpts) => azureDevOps.getPullRequest({ ...scope, ...prOpts }),
		editPullRequest: (prOpts) => azureDevOps.editPullRequest({ ...scope, ...prOpts, ...(prOpts.body === undefined ? {} : { body: clip(prOpts.body, AZURE_MAX_PR_BODY) }) }),
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

// The one place `GitProviderResolverDeps` is assembled off a `FastifyInstance` —
// `line-deps.ts` and any route handler outside the line (the `/repositories`
// config routes) both need exactly this closure, and building it twice is the
// kind of duplication `pnpm dup` exists to catch.
export function bindGitProviderFor(fastify: FastifyInstance): (repository: Repository) => Promise<GitProvider> {
	return (repository) =>
		gitProviderFor(
			{
				githubInstallationRepo: fastify.repos.githubInstallationRepo,
				azureConnectionRepo: fastify.repos.azureConnectionRepo,
				githubApp: fastify.services.githubApp,
				azureDevOps: fastify.services.azureDevOps,
				patEncryption: fastify.services.patEncryption
			},
			repository
		);
}
