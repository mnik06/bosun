import { type FastifyInstance } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';
import { runAzureConnectionCall, type AzureConnectionGuardDeps } from 'src/controllers/azure/shared/connection-guard';
import { resolveGithubToken } from 'src/controllers/github/shared/resolve-github-token';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
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

// One token, resolved once by the caller below and reused for every operation:
// an App-connected repository's token already carries the union of permissions
// every call here needs (`installationToken`'s own doc explains why), and a
// PAT carries whatever its owner granted it — there is nothing left for this
// module to mint per call. `repositoryToken` is the one exception, passed in
// rather than derived from `token`: it is `resolveGithubToken`'s own narrower
// mint (App) or the same PAT with a synthetic expiry (PAT), matching what a
// machine's git credential is scoped to today.
function githubProvider(opts: {
	githubApp: GithubAppService;
	githubRepoId: number;
	token: string;
	repositoryToken: () => Promise<{ token: string; expiresAt: Date }>;
}): GitProvider {
	const { githubApp, githubRepoId, token } = opts;

	return {
		getRepository: () => githubApp.getRepository({ token, githubRepoId }),
		readFile: (fileOpts) => githubApp.readFile({ token, githubRepoId, ...fileOpts }),
		proposeFile: (fileOpts) => githubApp.proposeFile({ token, githubRepoId, ...fileOpts }),
		pointBranch: (branchOpts) => githubApp.pointBranch({ token, githubRepoId, ...branchOpts }),
		openOrUpdatePullRequest: (prOpts) => githubApp.openOrUpdatePullRequest({ token, githubRepoId, ...prOpts }),
		getPullRequest: (prOpts) => githubApp.getPullRequest({ token, githubRepoId, ...prOpts }),
		editPullRequest: (prOpts) => githubApp.editPullRequest({ token, githubRepoId, ...prOpts }),
		repositoryToken: opts.repositoryToken
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
	githubPatConnectionRepo: GithubPatConnectionRepo;
	githubApp: GithubAppService;
	azureDevOps: AzureDevOpsService;
	patEncryption: PatEncryptionService;
}

async function githubProviderFor(deps: GitProviderResolverDeps, repository: Repository): Promise<GitProvider> {
	const repositoryToken = () => resolveGithubToken(repository, deps);

	if (repository.installationId !== null) {
		const installation = await deps.githubInstallationRepo.getById(repository.installationId);

		if (!installation || repository.githubRepoId === null) {
			throw new HttpError(409, 'The GitHub installation this repository came from is no longer connected');
		}

		const githubRepoId = repository.githubRepoId;
		const token = await deps.githubApp.installationToken({ installationId: installation.installationId, githubRepoId });

		return githubProvider({ githubApp: deps.githubApp, githubRepoId, token, repositoryToken });
	}

	if (repository.githubPatConnectionId !== null) {
		const connection = await deps.githubPatConnectionRepo.getById(repository.githubPatConnectionId);

		if (!connection || repository.githubRepoId === null) {
			throw new HttpError(409, 'The personal access token this repository came from is no longer connected');
		}

		if (connection.status === 'broken') {
			throw new HttpError(409, "This repository's personal access token is broken — replace it in Settings before bosun can reach this repository");
		}

		const encryptedToken = await deps.githubPatConnectionRepo.getEncryptedTokenById({ id: connection.id, projectId: connection.projectId });

		if (encryptedToken === null) {
			throw new HttpError(409, 'The personal access token this repository came from is no longer connected');
		}

		const githubRepoId = repository.githubRepoId;
		const token = deps.patEncryption.decrypt(encryptedToken);

		return githubProvider({ githubApp: deps.githubApp, githubRepoId, token, repositoryToken });
	}

	throw new HttpError(409, 'This repository is no longer connected to a GitHub installation or personal access token');
}

// Resolves the `GitProvider` for one already-attached repository, from
// `repository.provider` alone — the seam the line's GitHub-only callers move
// onto as they are migrated. A repository whose connection is gone or broken
// refuses here rather than at the first call the caller happens to make.
export async function gitProviderFor(deps: GitProviderResolverDeps, repository: Repository): Promise<GitProvider> {
	if (repository.provider === 'github') {
		return githubProviderFor(deps, repository);
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
				githubPatConnectionRepo: fastify.repos.githubPatConnectionRepo,
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
