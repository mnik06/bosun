import { describe, expect, it, vi } from 'vitest';
import { gitProviderFor, type GitProviderResolverDeps } from 'src/controllers/line/shared/git-provider-for';
import { type Repository } from 'src/types/RepositorySchema';

const BASE: Repository = {
	id: 'repo_1',
	projectId: 'prj_1',
	provider: 'github',
	installationId: null,
	githubRepoId: null,
	azureConnectionId: null,
	azureProjectId: null,
	azureRepoId: null,
	fullName: 'acme/app',
	defaultBranch: 'main',
	configDraft: null,
	configOnDefault: false,
	autoResolveConflicts: true,
	lastSyncedAt: null,
	createdAt: new Date()
};

function deps(overrides: Partial<GitProviderResolverDeps> = {}): GitProviderResolverDeps {
	return {
		githubInstallationRepo: { getById: vi.fn().mockResolvedValue(null) } as unknown as GitProviderResolverDeps['githubInstallationRepo'],
		azureConnectionRepo: {
			getById: vi.fn().mockResolvedValue(null),
			getEncryptedPatById: vi.fn().mockResolvedValue(null)
		} as unknown as GitProviderResolverDeps['azureConnectionRepo'],
		githubApp: { getRepository: vi.fn() } as unknown as GitProviderResolverDeps['githubApp'],
		azureDevOps: { getRepository: vi.fn() } as unknown as GitProviderResolverDeps['azureDevOps'],
		patEncryption: { decrypt: vi.fn((value: string) => `decrypted:${value}`) } as unknown as GitProviderResolverDeps['patEncryption'],
		...overrides
	};
}

describe('gitProviderFor', () => {
	it('resolves a GitHub repository to a provider bound to its installation', async () => {
		const githubInstallationRepo = { getById: vi.fn().mockResolvedValue({ id: 'ghi_1', installationId: 42 }) };
		const githubApp = { getRepository: vi.fn().mockResolvedValue({ fullName: 'acme/app', defaultBranch: 'main', cloneUrl: 'https://github.com/acme/app' }) };
		const provider = await gitProviderFor(
			deps({ githubInstallationRepo, githubApp } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, installationId: 'ghi_1', githubRepoId: 7 }
		);

		await provider.getRepository();

		expect(githubApp.getRepository).toHaveBeenCalledWith({ installationId: 42, githubRepoId: 7 });
	});

	it('refuses a GitHub repository whose installation is gone', async () => {
		await expect(gitProviderFor(deps(), { ...BASE, installationId: 'ghi_missing', githubRepoId: 7 })).rejects.toMatchObject({ statusCode: 409 });
	});

	it('resolves an Azure repository to a provider that decrypts the connection PAT', async () => {
		const azureConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'azc_1', organization: 'my-org', status: 'active', projectId: 'prj_1' }),
			getEncryptedPatById: vi.fn().mockResolvedValue('encrypted-pat')
		};
		const azureDevOps = { getRepository: vi.fn().mockResolvedValue({ fullName: 'my-org/proj/app', defaultBranch: 'main', cloneUrl: 'https://dev.azure.com/my-org/proj/_git/app' }) };
		const provider = await gitProviderFor(
			deps({ azureConnectionRepo, azureDevOps } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, provider: 'azure_devops', azureConnectionId: 'azc_1', azureProjectId: 'proj', azureRepoId: 'repo-guid' }
		);

		await provider.getRepository();

		expect(azureDevOps.getRepository).toHaveBeenCalledWith(
			expect.objectContaining({ organization: 'my-org', pat: 'decrypted:encrypted-pat', azureProjectId: 'proj', azureRepoId: 'repo-guid' })
		);
	});

	it('refuses every operation but getRepository for Azure, since they are not built yet', async () => {
		const azureConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'azc_1', organization: 'my-org', status: 'active', projectId: 'prj_1' }),
			getEncryptedPatById: vi.fn().mockResolvedValue('encrypted-pat')
		};
		const provider = await gitProviderFor(
			deps({ azureConnectionRepo } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, provider: 'azure_devops', azureConnectionId: 'azc_1', azureProjectId: 'proj', azureRepoId: 'repo-guid' }
		);

		await expect(provider.readFile({ path: 'a', ref: 'main' })).rejects.toMatchObject({ statusCode: 501 });
		await expect(provider.pointBranch({ branch: 'b', sha: 's' })).rejects.toMatchObject({ statusCode: 501 });
	});

	it("refuses an Azure repository whose connection's token is broken", async () => {
		const azureConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'azc_1', organization: 'my-org', status: 'broken', projectId: 'prj_1' }),
			getEncryptedPatById: vi.fn()
		};

		await expect(
			gitProviderFor(
				deps({ azureConnectionRepo } as unknown as Partial<GitProviderResolverDeps>),
				{ ...BASE, provider: 'azure_devops', azureConnectionId: 'azc_1', azureProjectId: 'proj', azureRepoId: 'repo-guid' }
			)
		).rejects.toMatchObject({ statusCode: 409 });
		expect(azureConnectionRepo.getEncryptedPatById).not.toHaveBeenCalled();
	});
});
