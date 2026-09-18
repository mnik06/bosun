import { describe, expect, it, vi } from 'vitest';
import { resolveGithubToken } from 'src/controllers/github/shared/resolve-github-token';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { GithubError, type GithubAppService } from 'src/services/github/github-app.service';
import { type Repository } from 'src/types/RepositorySchema';

function repository(overrides: Partial<Repository> = {}): Repository {
	return {
		id: 'repo_1',
		projectId: 'proj_1',
		provider: 'github',
		installationId: null,
		githubRepoId: null,
		githubPatConnectionId: null,
		syncMode: null,
		azureConnectionId: null,
		azureProjectId: null,
		azureRepoId: null,
		fullName: 'o/r',
		defaultBranch: 'main',
		configDraft: null,
		configOnDefault: false,
		autoResolveConflicts: false,
		lastSyncedAt: null,
		azureSyncMode: null,
		createdAt: new Date(),
		...overrides
	};
}

function deps() {
	const githubInstallationRepo = { getById: vi.fn().mockResolvedValue(null) } as unknown as GithubInstallationRepo;
	const githubPatConnectionRepo = { getEncryptedTokenById: vi.fn().mockResolvedValue(null) } as unknown as GithubPatConnectionRepo;
	const githubApp = { repositoryToken: vi.fn() } as unknown as GithubAppService;
	const patEncryption = { decrypt: vi.fn((v: string) => `decrypted:${v}`) } as unknown as PatEncryptionService;

	return { githubInstallationRepo, githubPatConnectionRepo, githubApp, patEncryption };
}

describe('resolveGithubToken', () => {
	it('mints an App installation token when installationId is set', async () => {
		const d = deps();
		(d.githubInstallationRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'inst_1', installationId: 999 });
		(d.githubApp.repositoryToken as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 'gh-token', expiresAt: new Date() });

		const result = await resolveGithubToken(repository({ installationId: 'inst_1', githubRepoId: 42 }), d);

		expect(d.githubApp.repositoryToken).toHaveBeenCalledWith({ installationId: 999, githubRepoId: 42 });
		expect(result.token).toBe('gh-token');
	});

	it('maps a GitHub error minting an App token to an HttpError', async () => {
		const d = deps();
		(d.githubInstallationRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'inst_1', installationId: 999 });
		(d.githubApp.repositoryToken as ReturnType<typeof vi.fn>).mockRejectedValue(new GithubError(404, 'installation gone'));

		await expect(resolveGithubToken(repository({ installationId: 'inst_1', githubRepoId: 42 }), d)).rejects.toMatchObject({ statusCode: 502 });
	});

	it('decrypts the stored PAT when githubPatConnectionId is set', async () => {
		const d = deps();
		(d.githubPatConnectionRepo.getEncryptedTokenById as ReturnType<typeof vi.fn>).mockResolvedValue('enc-payload');

		const result = await resolveGithubToken(repository({ githubPatConnectionId: 'gpc_1' }), d);

		expect(d.githubPatConnectionRepo.getEncryptedTokenById).toHaveBeenCalledWith({ id: 'gpc_1', projectId: 'proj_1' });
		expect(result.token).toBe('decrypted:enc-payload');
	});

	it('refuses when neither an installation nor a PAT connection is set', async () => {
		const d = deps();

		await expect(resolveGithubToken(repository(), d)).rejects.toMatchObject({ statusCode: 403 });
	});
});
