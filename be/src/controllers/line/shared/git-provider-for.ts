import { type FastifyInstance } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';
import { runAzureConnectionCall, type AzureConnectionGuardDeps } from 'src/controllers/azure/shared/connection-guard';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GitProvider } from 'src/services/git/git-provider';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type AzureConnection } from 'src/types/AzureSchema';
import { type Repository } from 'src/types/RepositorySchema';
import { clip } from 'src/utils/general';

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

// Every call is made through `runAzureConnectionCall` — the same guard the
// sync job uses — so a 401 or a non-JSON body from any of these flips the
// connection broken and notifies the project (AC-69, AC-70) exactly as
// reactively as a background poll would, and a connection still under a
// Retry-After cooldown refuses here before Azure is asked anything (AC-71, AC-75).
function azureProvider(opts: { deps: GitProviderResolverDeps; connection: AzureConnection; azureDevOps: AzureDevOpsService; organization: string; pat: string; azureProjectId: string; azureRepoId: string }): GitProvider {
	const { azureDevOps, deps, connection, ...scope } = opts;
	const guarded = <T>(run: () => Promise<T>): Promise<T> => runAzureConnectionCall(deps, connection, run);

	return {
		getRepository: () => guarded(() => azureDevOps.getRepository(scope)),
		readFile: (fileOpts) => guarded(() => azureDevOps.readFile({ ...scope, ...fileOpts })),
		proposeFile: (fileOpts) => guarded(() => azureDevOps.proposeFile({ ...scope, ...fileOpts, body: clip(fileOpts.body, AZURE_MAX_PR_BODY) })),
		pointBranch: (branchOpts) => guarded(() => azureDevOps.pointBranch({ ...scope, ...branchOpts })),
		openOrUpdatePullRequest: (prOpts) => guarded(() => azureDevOps.openOrUpdatePullRequest({ ...scope, ...prOpts, body: clip(prOpts.body, AZURE_MAX_PR_BODY) })),
		getPullRequest: (prOpts) => guarded(() => azureDevOps.getPullRequest({ ...scope, ...prOpts })),
		editPullRequest: (prOpts) => guarded(() => azureDevOps.editPullRequest({ ...scope, ...prOpts, ...(prOpts.body === undefined ? {} : { body: clip(prOpts.body, AZURE_MAX_PR_BODY) }) })),
		repositoryToken: azureNotBuilt('minting a repository token')
	};
}

export interface GitProviderResolverDeps extends AzureConnectionGuardDeps {
	githubInstallationRepo: GithubInstallationRepo;
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
		deps,
		connection,
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
				patEncryption: fastify.services.patEncryption,
				azureConnectionGuard: fastify.services.azureConnectionGuard,
				projectMemberRepo: fastify.repos.projectMemberRepo,
				notificationRepo: fastify.repos.notificationRepo,
				pushSubscriptionRepo: fastify.repos.pushSubscriptionRepo,
				socketRegistry: fastify.services.socketRegistry,
				webPush: fastify.services.webPush,
				idService: fastify.services.idService,
				appUrl: fastify.env.PUBLIC_APP_URL
			},
			repository
		);
}
