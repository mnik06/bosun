import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type Repository } from 'src/types/RepositorySchema';

// A PAT exposes no per-request expiry, unlike a minted App installation token, so
// this synthesizes one on the same ~1-hour cadence — short enough that a
// credential handed to a machine is refreshed the way a real App token would be,
// long enough not to re-decrypt on every git operation.
const GITHUB_PAT_CREDENTIAL_TTL_MS = 60 * 60 * 1000;

export interface ResolveGithubTokenDeps {
	githubInstallationRepo: GithubInstallationRepo;
	githubPatConnectionRepo: GithubPatConnectionRepo;
	githubApp: GithubAppService;
	patEncryption: PatEncryptionService;
}

// The one place that decides where a GitHub bearer token comes from for an
// already-attached repository: a short-lived App installation token when
// `installationId` is set, or the connection's own stored PAT when
// `githubPatConnectionId` is set. Refuses the same way — 403, "no longer
// connected" — whichever kind of connection is missing, so a caller does not
// need to know which one it was.
export async function resolveGithubToken(repository: Repository, deps: ResolveGithubTokenDeps): Promise<{ token: string; expiresAt: Date }> {
	if (repository.installationId !== null) {
		const installation = await deps.githubInstallationRepo.getById(repository.installationId);

		if (!installation || repository.githubRepoId === null) {
			throw new HttpError(403, 'The repository this machine was attached to is no longer connected');
		}

		try {
			return await deps.githubApp.repositoryToken({ installationId: installation.installationId, githubRepoId: repository.githubRepoId });
		} catch (error) {
			throw toGithubHttpError(error);
		}
	}

	if (repository.githubPatConnectionId !== null) {
		const encryptedToken = await deps.githubPatConnectionRepo.getEncryptedTokenById({ id: repository.githubPatConnectionId, projectId: repository.projectId });

		if (encryptedToken === null) {
			throw new HttpError(403, 'The repository this machine was attached to is no longer connected');
		}

		return { token: deps.patEncryption.decrypt(encryptedToken), expiresAt: new Date(Date.now() + GITHUB_PAT_CREDENTIAL_TTL_MS) };
	}

	throw new HttpError(403, 'The repository this machine was attached to is no longer connected');
}
