import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type AvailableRepository } from 'src/types/RepositorySchema';

// Exactly what the project's installations grant, asked of GitHub each time. A
// repository removed from an installation disappears here without bosun having to
// hear about it.
async function fromInstallations(opts: { githubApp: GithubAppService; githubInstallationRepo: GithubInstallationRepo; projectId: string }): Promise<AvailableRepository[]> {
	const installations = await opts.githubInstallationRepo.listForProject(opts.projectId);

	try {
		const granted = await Promise.all(
			installations.map(async (installation) =>
				(await opts.githubApp.listRepositories(installation.installationId)).map(
					(repo): AvailableRepository => ({
						githubRepoId: repo.githubRepoId,
						fullName: repo.fullName,
						defaultBranch: repo.defaultBranch,
						private: repo.private,
						connection: { kind: 'app', installationId: installation.id, accountLogin: installation.accountLogin }
					})
				)
			)
		);

		return granted.flat();
	} catch (error) {
		throw toGithubHttpError(error);
	}
}

// Every active PAT connection's own pushable repositories. A connection that is
// broken, or whose own listing call fails, contributes nothing rather than
// failing the whole picker for the project's other connections (AC-60).
async function fromPatConnections(opts: {
	githubPatConnectionRepo: GithubPatConnectionRepo;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	projectId: string;
}): Promise<AvailableRepository[]> {
	const connections = await opts.githubPatConnectionRepo.listForProject(opts.projectId);
	const active = connections.filter((connection) => connection.status === 'active');

	const granted = await Promise.all(
		active.map(async (connection): Promise<AvailableRepository[]> => {
			const encryptedToken = await opts.githubPatConnectionRepo.getEncryptedTokenById({ id: connection.id, projectId: opts.projectId });

			if (encryptedToken === null) {
				return [];
			}

			const pat = opts.patEncryption.decrypt(encryptedToken);

			return opts.githubPat
				.listPushableRepositories(pat)
				.then((repositories) =>
					repositories.map(
						(repo): AvailableRepository => ({
							...repo,
							connection: { kind: 'pat', connectionId: connection.id, githubLogin: connection.githubLogin }
						})
					)
				)
				.catch(() => []);
		})
	);

	return granted.flat();
}

// The merged picker (AC-20, AC-21): every repository an App installation or a
// PAT connection grants, deduped by `githubRepoId` with the App winning when
// both reach the same repository (AC-22) — the App is listed first, so a later
// PAT entry for the same id is the one `Map` drops.
export async function listAvailableRepositories(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	githubPatConnectionRepo: GithubPatConnectionRepo;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	projectId: string;
}): Promise<AvailableRepository[]> {
	const [fromApp, fromPat] = await Promise.all([fromInstallations(opts), fromPatConnections(opts)]);
	const byRepoId = new Map<number, AvailableRepository>();

	for (const repository of [...fromApp, ...fromPat]) {
		if (!byRepoId.has(repository.githubRepoId)) {
			byRepoId.set(repository.githubRepoId, repository);
		}
	}

	return [...byRepoId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}
