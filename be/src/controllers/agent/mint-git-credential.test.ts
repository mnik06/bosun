import { describe, expect, it, vi } from 'vitest';
import { mintGitCredential } from 'src/controllers/agent/mint-git-credential';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubAppService } from 'src/services/github/github-app.service';
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

function build(opts: { repo: Repository | null }) {
	const machineRepo = { getById: vi.fn().mockResolvedValue({ repositoryId: opts.repo ? opts.repo.id : null }) } as unknown as MachineRepo;
	const repositoryRepo = { getById: vi.fn().mockResolvedValue(opts.repo) } as unknown as RepositoryRepo;
	const githubInstallationRepo = { getById: vi.fn().mockResolvedValue(null) } as unknown as GithubInstallationRepo;
	const githubPatConnectionRepo = { getEncryptedTokenById: vi.fn().mockResolvedValue(null) } as unknown as GithubPatConnectionRepo;
	const azureConnectionRepo = { getEncryptedPatById: vi.fn().mockResolvedValue(null) } as unknown as AzureConnectionRepo;
	const githubApp = { repositoryToken: vi.fn() } as unknown as GithubAppService;
	const patEncryption = { decrypt: vi.fn((v: string) => `decrypted:${v}`) } as unknown as PatEncryptionService;

	return {
		machineRepo,
		repositoryRepo,
		githubInstallationRepo,
		githubPatConnectionRepo,
		azureConnectionRepo,
		githubApp,
		patEncryption,
		run: () =>
			mintGitCredential({
				machineRepo,
				repositoryRepo,
				githubInstallationRepo,
				githubPatConnectionRepo,
				azureConnectionRepo,
				githubApp,
				patEncryption,
				machineId: 'm_1'
			})
	};
}

describe('mintGitCredential', () => {
	// AC-36/AC-37: Azure's git-credential answer is the same decrypted PAT the
	// connection stores, resolved only from the calling machine's own attached
	// repository — never a caller-supplied one, since there is no such argument.
	it('decrypts and returns the PAT for an Azure-attached repository', async () => {
		const { run, azureConnectionRepo, patEncryption } = build({
			repo: repository({ provider: 'azure_devops', azureConnectionId: 'azc_1' })
		});

		(azureConnectionRepo.getEncryptedPatById as ReturnType<typeof vi.fn>).mockResolvedValue('enc-payload');

		const result = await run();

		expect(azureConnectionRepo.getEncryptedPatById).toHaveBeenCalledWith({ id: 'azc_1', projectId: 'proj_1' });
		expect(patEncryption.decrypt).toHaveBeenCalledWith('enc-payload');
		expect(result.token).toBe('decrypted:enc-payload');
	});

	it('refuses when the Azure repository has no connection PAT to decrypt', async () => {
		const { run } = build({ repo: repository({ provider: 'azure_devops', azureConnectionId: 'azc_1' }) });

		await expect(run()).rejects.toMatchObject({ statusCode: 403 });
	});

	it('still mints a GitHub installation token for a GitHub repository', async () => {
		const { run, githubInstallationRepo, githubApp } = build({
			repo: repository({ provider: 'github', installationId: 'inst_1', githubRepoId: 42 })
		});

		(githubInstallationRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'inst_1', installationId: 999 });
		(githubApp.repositoryToken as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 'gh-token', expiresAt: new Date() });

		const result = await run();

		expect(githubApp.repositoryToken).toHaveBeenCalledWith({ installationId: 999, githubRepoId: 42 });
		expect(result.token).toBe('gh-token');
	});

	it('refuses when the machine has no repository attached', async () => {
		const { run } = build({ repo: null });

		await expect(run()).rejects.toMatchObject({ statusCode: 403 });
	});

	// AC-23: the credential route answers a PAT-connected repository with the
	// connection's own stored token, decrypted, rather than trying to mint an App
	// installation token it has none of.
	it('decrypts and returns the PAT for a PAT-connected GitHub repository', async () => {
		const { run, githubPatConnectionRepo, patEncryption } = build({
			repo: repository({ provider: 'github', githubPatConnectionId: 'gpc_1' })
		});

		(githubPatConnectionRepo.getEncryptedTokenById as ReturnType<typeof vi.fn>).mockResolvedValue('enc-payload');

		const result = await run();

		expect(githubPatConnectionRepo.getEncryptedTokenById).toHaveBeenCalledWith({ id: 'gpc_1', projectId: 'proj_1' });
		expect(patEncryption.decrypt).toHaveBeenCalledWith('enc-payload');
		expect(result.token).toBe('decrypted:enc-payload');
	});

	// AC-19: disconnecting a PAT connection cascades the delete to its
	// repositories (the FK's `onDelete: 'cascade'`, same as removing a GitHub App
	// installation already does), so a machine's `repositoryId` still points at a
	// row that is gone. `repositoryRepo.getById` resolving nothing is refused the
	// same "no longer connected" way regardless of which provider it was.
	it('refuses when the machine is attached to a repository that no longer exists', async () => {
		const machineRepo = { getById: vi.fn().mockResolvedValue({ repositoryId: 'repo_1' }) } as unknown as MachineRepo;
		const repositoryRepo = { getById: vi.fn().mockResolvedValue(null) } as unknown as RepositoryRepo;
		const githubInstallationRepo = { getById: vi.fn() } as unknown as GithubInstallationRepo;
		const githubPatConnectionRepo = { getEncryptedTokenById: vi.fn() } as unknown as GithubPatConnectionRepo;
		const azureConnectionRepo = { getEncryptedPatById: vi.fn() } as unknown as AzureConnectionRepo;
		const githubApp = { repositoryToken: vi.fn() } as unknown as GithubAppService;
		const patEncryption = { decrypt: vi.fn() } as unknown as PatEncryptionService;

		await expect(
			mintGitCredential({ machineRepo, repositoryRepo, githubInstallationRepo, githubPatConnectionRepo, azureConnectionRepo, githubApp, patEncryption, machineId: 'm_1' })
		).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('no longer connected') });
	});
});
