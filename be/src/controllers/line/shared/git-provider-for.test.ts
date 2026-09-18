import { describe, expect, it, vi } from 'vitest';
import { gitProviderFor, type GitProviderResolverDeps } from 'src/controllers/line/shared/git-provider-for';
import { GithubError } from 'src/services/github/github-app.service';
import { getGithubPatConnectionGuardService } from 'src/services/github/github-pat-connection-guard.service';
import { type Repository } from 'src/types/RepositorySchema';

const BASE: Repository = {
	id: 'repo_1',
	projectId: 'prj_1',
	provider: 'github',
	installationId: null,
	githubRepoId: null,
	githubPatConnectionId: null,
	syncMode: null,
	azureConnectionId: null,
	azureProjectId: null,
	azureRepoId: null,
	fullName: 'acme/app',
	defaultBranch: 'main',
	configDraft: null,
	configOnDefault: false,
	autoResolveConflicts: true,
	lastSyncedAt: null,
	azureSyncMode: null,
	createdAt: new Date()
};

function deps(overrides: Partial<GitProviderResolverDeps> = {}): GitProviderResolverDeps {
	return {
		githubInstallationRepo: { getById: vi.fn().mockResolvedValue(null) } as unknown as GitProviderResolverDeps['githubInstallationRepo'],
		githubPatConnectionRepo: {
			getById: vi.fn().mockResolvedValue(null),
			getEncryptedTokenById: vi.fn().mockResolvedValue(null)
		} as unknown as GitProviderResolverDeps['githubPatConnectionRepo'],
		azureConnectionRepo: {
			getById: vi.fn().mockResolvedValue(null),
			getEncryptedPatById: vi.fn().mockResolvedValue(null),
			markBroken: vi.fn()
		} as unknown as GitProviderResolverDeps['azureConnectionRepo'],
		githubApp: {
			getRepository: vi.fn(),
			installationToken: vi.fn().mockResolvedValue('minted-token'),
			repositoryToken: vi.fn()
		} as unknown as GitProviderResolverDeps['githubApp'],
		azureDevOps: { getRepository: vi.fn() } as unknown as GitProviderResolverDeps['azureDevOps'],
		patEncryption: { decrypt: vi.fn((value: string) => `decrypted:${value}`) } as unknown as GitProviderResolverDeps['patEncryption'],
		azureConnectionGuard: { isRateLimited: vi.fn().mockReturnValue(false), run: (_id: string, run: () => unknown) => run() } as unknown as GitProviderResolverDeps['azureConnectionGuard'],
		githubPatConnectionGuard: getGithubPatConnectionGuardService(),
		projectMemberRepo: { list: vi.fn().mockResolvedValue([]) } as unknown as GitProviderResolverDeps['projectMemberRepo'],
		notificationRepo: { create: vi.fn() } as unknown as GitProviderResolverDeps['notificationRepo'],
		pushSubscriptionRepo: { listByUserIds: vi.fn().mockResolvedValue([]) } as unknown as GitProviderResolverDeps['pushSubscriptionRepo'],
		socketRegistry: { sendToUiUser: vi.fn() } as unknown as GitProviderResolverDeps['socketRegistry'],
		webPush: { send: vi.fn() } as unknown as GitProviderResolverDeps['webPush'],
		idService: { createNotificationId: () => 'ntf_1' } as unknown as GitProviderResolverDeps['idService'],
		appUrl: 'https://app.example.com',
		...overrides
	};
}

describe('gitProviderFor', () => {
	it('resolves a GitHub repository to a provider bound to its installation', async () => {
		const githubInstallationRepo = { getById: vi.fn().mockResolvedValue({ id: 'ghi_1', installationId: 42 }) };
		const githubApp = {
			getRepository: vi.fn().mockResolvedValue({ fullName: 'acme/app', defaultBranch: 'main', cloneUrl: 'https://github.com/acme/app' }),
			installationToken: vi.fn().mockResolvedValue('minted-token')
		};
		const provider = await gitProviderFor(
			deps({ githubInstallationRepo, githubApp } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, installationId: 'ghi_1', githubRepoId: 7 }
		);

		await provider.getRepository();

		expect(githubApp.installationToken).toHaveBeenCalledWith({ installationId: 42, githubRepoId: 7 });
		expect(githubApp.getRepository).toHaveBeenCalledWith({ token: 'minted-token', githubRepoId: 7 });
	});

	it('refuses a GitHub repository whose installation is gone', async () => {
		await expect(gitProviderFor(deps(), { ...BASE, installationId: 'ghi_missing', githubRepoId: 7 })).rejects.toMatchObject({ statusCode: 409 });
	});

	it('resolves a GitHub repository connected by a personal access token to a provider that decrypts it', async () => {
		const githubPatConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'gpc_1', projectId: 'prj_1', status: 'active' }),
			getEncryptedTokenById: vi.fn().mockResolvedValue('encrypted-pat')
		};
		const githubApp = { getRepository: vi.fn().mockResolvedValue({ fullName: 'acme/app', defaultBranch: 'main', cloneUrl: 'https://github.com/acme/app' }) };
		const provider = await gitProviderFor(
			deps({ githubPatConnectionRepo, githubApp } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, githubPatConnectionId: 'gpc_1', githubRepoId: 7 }
		);

		await provider.getRepository();

		expect(githubPatConnectionRepo.getEncryptedTokenById).toHaveBeenCalledWith({ id: 'gpc_1', projectId: 'prj_1' });
		expect(githubApp.getRepository).toHaveBeenCalledWith({ token: 'decrypted:encrypted-pat', githubRepoId: 7 });
	});

	it('marks a PAT connection broken when an operation on it fails with an invalid-token error (AC-43)', async () => {
		const markBroken = vi.fn().mockResolvedValue({ id: 'gpc_1', status: 'broken' });
		const githubPatConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'gpc_1', projectId: 'prj_1', githubLogin: 'octocat', status: 'active' }),
			getEncryptedTokenById: vi.fn().mockResolvedValue('encrypted-pat'),
			markBroken
		};
		const githubApp = { getRepository: vi.fn().mockRejectedValue(new GithubError(401, 'Bad credentials')) };
		const provider = await gitProviderFor(
			deps({ githubPatConnectionRepo, githubApp } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, githubPatConnectionId: 'gpc_1', githubRepoId: 7 }
		);

		await expect(provider.getRepository()).rejects.toBeInstanceOf(GithubError);
		expect(markBroken).toHaveBeenCalledWith({ id: 'gpc_1', lastError: expect.stringContaining('Bad credentials') });
	});

	it('never marks a PAT connection broken on a repository-scoped 403 (AC-70)', async () => {
		const markBroken = vi.fn();
		const githubPatConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'gpc_1', projectId: 'prj_1', githubLogin: 'octocat', status: 'active' }),
			getEncryptedTokenById: vi.fn().mockResolvedValue('encrypted-pat'),
			markBroken
		};
		const githubApp = { getRepository: vi.fn().mockRejectedValue(new GithubError(403, 'Resource not accessible by personal access token')) };
		const provider = await gitProviderFor(
			deps({ githubPatConnectionRepo, githubApp } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, githubPatConnectionId: 'gpc_1', githubRepoId: 7 }
		);

		await expect(provider.getRepository()).rejects.toBeInstanceOf(GithubError);
		expect(markBroken).not.toHaveBeenCalled();
	});

	it('refuses a GitHub repository whose PAT connection is gone', async () => {
		await expect(gitProviderFor(deps(), { ...BASE, githubPatConnectionId: 'gpc_missing', githubRepoId: 7 })).rejects.toMatchObject({ statusCode: 409 });
	});

	it("refuses a GitHub repository whose PAT connection's token is broken", async () => {
		const githubPatConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'gpc_1', projectId: 'prj_1', status: 'broken' }),
			getEncryptedTokenById: vi.fn()
		};

		await expect(
			gitProviderFor(
				deps({ githubPatConnectionRepo } as unknown as Partial<GitProviderResolverDeps>),
				{ ...BASE, githubPatConnectionId: 'gpc_1', githubRepoId: 7 }
			)
		).rejects.toMatchObject({ statusCode: 409 });
		expect(githubPatConnectionRepo.getEncryptedTokenById).not.toHaveBeenCalled();
	});

	it('refuses a GitHub repository connected to neither an installation nor a PAT', async () => {
		await expect(gitProviderFor(deps(), { ...BASE, githubRepoId: 7 })).rejects.toMatchObject({ statusCode: 409 });
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

	it('refuses only repositoryToken for Azure — mint-git-credential.ts decrypts the PAT directly instead', async () => {
		const azureConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'azc_1', organization: 'my-org', status: 'active', projectId: 'prj_1' }),
			getEncryptedPatById: vi.fn().mockResolvedValue('encrypted-pat')
		};
		const provider = await gitProviderFor(
			deps({ azureConnectionRepo } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, provider: 'azure_devops', azureConnectionId: 'azc_1', azureProjectId: 'proj', azureRepoId: 'repo-guid' }
		);

		await expect(provider.repositoryToken()).rejects.toMatchObject({ statusCode: 501 });
	});

	it('wires every other Azure operation to the service, scoped to the connection and clipped to Azure’s PR body limit', async () => {
		const azureConnectionRepo = {
			getById: vi.fn().mockResolvedValue({ id: 'azc_1', organization: 'my-org', status: 'active', projectId: 'prj_1' }),
			getEncryptedPatById: vi.fn().mockResolvedValue('encrypted-pat')
		};
		const azureDevOps = {
			readFile: vi.fn().mockResolvedValue('content'),
			proposeFile: vi.fn().mockResolvedValue({ url: 'https://dev.azure.com/my-org/proj/_git/app/pullrequest/1' }),
			pointBranch: vi.fn().mockResolvedValue(undefined),
			openOrUpdatePullRequest: vi.fn().mockResolvedValue({ url: 'https://dev.azure.com/my-org/proj/_git/app/pullrequest/1', number: 1, updated: false }),
			getPullRequest: vi.fn().mockResolvedValue({ number: 1, url: 'https://x', state: 'open', merged: false, baseRef: 'main', baseSha: 'sha', headRef: 'b' }),
			editPullRequest: vi.fn().mockResolvedValue(undefined)
		};
		const scope = { organization: 'my-org', pat: 'decrypted:encrypted-pat', azureProjectId: 'proj', azureRepoId: 'repo-guid' };
		const provider = await gitProviderFor(
			deps({ azureConnectionRepo, azureDevOps } as unknown as Partial<GitProviderResolverDeps>),
			{ ...BASE, provider: 'azure_devops', azureConnectionId: 'azc_1', azureProjectId: 'proj', azureRepoId: 'repo-guid' }
		);

		await provider.readFile({ path: 'a', ref: 'main' });
		expect(azureDevOps.readFile).toHaveBeenCalledWith({ ...scope, path: 'a', ref: 'main' });

		await provider.pointBranch({ branch: 'b', sha: 's' });
		expect(azureDevOps.pointBranch).toHaveBeenCalledWith({ ...scope, branch: 'b', sha: 's' });

		await provider.editPullRequest({ number: 1, body: 'x'.repeat(5_000) });
		const editedBody = azureDevOps.editPullRequest.mock.calls[0][0].body as string;
		expect(editedBody.length).toBeLessThanOrEqual(4_001);
		expect(editedBody.endsWith('…')).toBe(true);

		await provider.openOrUpdatePullRequest({ head: 'h', base: 'm', title: 't', body: 'x'.repeat(5_000) });
		const openedBody = azureDevOps.openOrUpdatePullRequest.mock.calls[0][0].body as string;
		expect(openedBody.length).toBeLessThanOrEqual(4_001);
		expect(openedBody.endsWith('…')).toBe(true);

		await provider.proposeFile({ branch: 'b', path: 'a', content: 'c', message: 'm', title: 't', body: 'small body' });
		expect(azureDevOps.proposeFile).toHaveBeenCalledWith({ ...scope, branch: 'b', path: 'a', content: 'c', message: 'm', title: 't', body: 'small body' });

		await provider.getPullRequest({ number: 1 });
		expect(azureDevOps.getPullRequest).toHaveBeenCalledWith({ ...scope, number: 1 });
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
