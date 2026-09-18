import { describe, expect, it, vi } from 'vitest';
import { ensureGithubWebhookOnAttach, reconcileGithubWebhook, type GithubWebhookSyncDeps } from 'src/controllers/github/shared/webhook';
import { GithubPatError } from 'src/services/github/github-pat.service';
import { getGithubPatConnectionGuardService } from 'src/services/github/github-pat-connection-guard.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';
import { type Repository } from 'src/types/RepositorySchema';

const CONNECTION: GithubPatConnection = {
	id: 'gpc_1',
	projectId: 'prj_1',
	githubLogin: 'octocat',
	tokenType: 'fine_grained',
	status: 'active',
	lastError: null,
	brokenAt: null,
	createdByUserId: 'u_1',
	createdAt: new Date()
};

const REPOSITORY: Repository = {
	id: 'repo_1',
	projectId: 'prj_1',
	provider: 'github',
	installationId: null,
	githubRepoId: 7,
	githubPatConnectionId: 'gpc_1',
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

function deps(overrides: Partial<GithubWebhookSyncDeps> = {}): GithubWebhookSyncDeps {
	return {
		repositoryRepo: {
			getGithubWebhookIdById: vi.fn().mockResolvedValue(null),
			saveGithubWebhook: vi.fn().mockResolvedValue(undefined),
			saveGithubSyncMode: vi.fn().mockResolvedValue(undefined)
		} as unknown as GithubWebhookSyncDeps['repositoryRepo'],
		githubPat: {
			createWebhook: vi.fn().mockResolvedValue({ githubWebhookId: 99 }),
			listWebhooks: vi.fn().mockResolvedValue([]),
			updateWebhookSecret: vi.fn().mockResolvedValue(undefined),
			getWebhook: vi.fn().mockResolvedValue({ active: true })
		} as unknown as GithubWebhookSyncDeps['githubPat'],
		patEncryption: { encrypt: vi.fn((value: string) => `encrypted:${value}`) } as unknown as GithubWebhookSyncDeps['patEncryption'],
		keyService: { generateWebhookSecret: () => 'generated-secret' } as unknown as GithubWebhookSyncDeps['keyService'],
		serverUrl: 'https://bosun.example',
		githubPatConnectionRepo: { markBroken: vi.fn() } as unknown as GithubWebhookSyncDeps['githubPatConnectionRepo'],
		projectMemberRepo: { list: vi.fn().mockResolvedValue([]) } as unknown as GithubWebhookSyncDeps['projectMemberRepo'],
		githubPatConnectionGuard: getGithubPatConnectionGuardService(),
		notificationRepo: { create: vi.fn() } as unknown as GithubWebhookSyncDeps['notificationRepo'],
		pushSubscriptionRepo: { listByUserIds: vi.fn().mockResolvedValue([]) } as unknown as GithubWebhookSyncDeps['pushSubscriptionRepo'],
		socketRegistry: { sendToUiUser: vi.fn() } as unknown as GithubWebhookSyncDeps['socketRegistry'],
		webPush: { send: vi.fn() } as unknown as GithubWebhookSyncDeps['webPush'],
		idService: { createNotificationId: () => 'ntf_1' } as unknown as GithubWebhookSyncDeps['idService'],
		appUrl: 'https://app.example.com',
		...overrides
	};
}

describe('ensureGithubWebhookOnAttach', () => {
	it('creates a webhook and stores its id, secret, and syncMode (AC-35)', async () => {
		const repositoryRepo = deps().repositoryRepo;
		const githubPat = { createWebhook: vi.fn().mockResolvedValue({ githubWebhookId: 55 }) } as unknown as GithubWebhookSyncDeps['githubPat'];

		await ensureGithubWebhookOnAttach(deps({ repositoryRepo, githubPat }), { repository: REPOSITORY, connection: CONNECTION, pat: 'p' });

		expect(githubPat.createWebhook).toHaveBeenCalledWith({ pat: 'p', fullName: 'acme/app', url: 'https://bosun.example/github/webhook/repo_1', secret: 'generated-secret' });
		expect(repositoryRepo.saveGithubWebhook).toHaveBeenCalledWith({ id: 'repo_1', webhookSecretEncrypted: 'encrypted:generated-secret', githubWebhookId: 55, syncMode: 'webhook' });
	});

	it('does nothing when a webhook id is already stored — no duplicate create (AC-63)', async () => {
		const repositoryRepo = { getGithubWebhookIdById: vi.fn().mockResolvedValue(123), saveGithubWebhook: vi.fn(), saveGithubSyncMode: vi.fn() } as unknown as GithubWebhookSyncDeps['repositoryRepo'];
		const githubPat = { createWebhook: vi.fn() } as unknown as GithubWebhookSyncDeps['githubPat'];

		await ensureGithubWebhookOnAttach(deps({ repositoryRepo, githubPat }), { repository: REPOSITORY, connection: CONNECTION, pat: 'p' });

		expect(githubPat.createWebhook).not.toHaveBeenCalled();
	});

	it('falls back to polling on a 403/404, without failing the attach (AC-36)', async () => {
		const repositoryRepo = deps().repositoryRepo;
		const githubPat = { createWebhook: vi.fn().mockRejectedValue(new GithubPatError('missing_scope', 'no admin:repo_hook')) } as unknown as GithubWebhookSyncDeps['githubPat'];

		await expect(ensureGithubWebhookOnAttach(deps({ repositoryRepo, githubPat }), { repository: REPOSITORY, connection: CONNECTION, pat: 'p' })).resolves.toBeUndefined();

		expect(repositoryRepo.saveGithubSyncMode).toHaveBeenCalledWith({ id: 'repo_1', syncMode: 'polling' });
		expect(repositoryRepo.saveGithubWebhook).not.toHaveBeenCalled();
	});

	it('adopts an existing hook under a fresh secret on a 422 rather than failing (AC-63)', async () => {
		const repositoryRepo = deps().repositoryRepo;
		const githubPat = {
			createWebhook: vi.fn().mockRejectedValue(new GithubPatError('webhook_exists', 'already there')),
			listWebhooks: vi.fn().mockResolvedValue([{ id: 7, url: 'https://bosun.example/github/webhook/repo_1' }]),
			updateWebhookSecret: vi.fn().mockResolvedValue(undefined)
		} as unknown as GithubWebhookSyncDeps['githubPat'];

		await ensureGithubWebhookOnAttach(deps({ repositoryRepo, githubPat }), { repository: REPOSITORY, connection: CONNECTION, pat: 'p' });

		expect(githubPat.updateWebhookSecret).toHaveBeenCalledWith({ pat: 'p', fullName: 'acme/app', webhookId: 7, url: 'https://bosun.example/github/webhook/repo_1', secret: 'generated-secret' });
		expect(repositoryRepo.saveGithubWebhook).toHaveBeenCalledWith(expect.objectContaining({ githubWebhookId: 7, syncMode: 'webhook' }));
	});
});

describe('reconcileGithubWebhook', () => {
	it('leaves a healthy webhook alone and reports webhook', async () => {
		const repositoryRepo = { getGithubWebhookIdById: vi.fn().mockResolvedValue(42), saveGithubWebhook: vi.fn(), saveGithubSyncMode: vi.fn() } as unknown as GithubWebhookSyncDeps['repositoryRepo'];
		const githubPat = { getWebhook: vi.fn().mockResolvedValue({ active: true }), createWebhook: vi.fn() } as unknown as GithubWebhookSyncDeps['githubPat'];

		const result = await reconcileGithubWebhook(deps({ repositoryRepo, githubPat }), { repository: REPOSITORY, connection: CONNECTION, pat: 'p' });

		expect(result).toBe('webhook');
		expect(githubPat.createWebhook).not.toHaveBeenCalled();
		expect(repositoryRepo.saveGithubSyncMode).toHaveBeenCalledWith({ id: 'repo_1', syncMode: 'webhook' });
	});

	it('recreates a missing or disabled webhook (AC-38)', async () => {
		const repositoryRepo = { getGithubWebhookIdById: vi.fn().mockResolvedValue(42), saveGithubWebhook: vi.fn(), saveGithubSyncMode: vi.fn() } as unknown as GithubWebhookSyncDeps['repositoryRepo'];
		const githubPat = {
			getWebhook: vi.fn().mockResolvedValue({ active: false }),
			createWebhook: vi.fn().mockResolvedValue({ githubWebhookId: 100 })
		} as unknown as GithubWebhookSyncDeps['githubPat'];

		const result = await reconcileGithubWebhook(deps({ repositoryRepo, githubPat }), { repository: REPOSITORY, connection: CONNECTION, pat: 'p' });

		expect(result).toBe('webhook');
		expect(githubPat.createWebhook).toHaveBeenCalledTimes(1);
		expect(repositoryRepo.saveGithubWebhook).toHaveBeenCalledWith(expect.objectContaining({ githubWebhookId: 100 }));
	});

	it('falls back to polling when recreation also fails', async () => {
		const repositoryRepo = { getGithubWebhookIdById: vi.fn().mockResolvedValue(null), saveGithubWebhook: vi.fn(), saveGithubSyncMode: vi.fn() } as unknown as GithubWebhookSyncDeps['repositoryRepo'];
		const githubPat = { createWebhook: vi.fn().mockRejectedValue(new GithubPatError('missing_scope', 'nope')) } as unknown as GithubWebhookSyncDeps['githubPat'];

		const result = await reconcileGithubWebhook(deps({ repositoryRepo, githubPat }), { repository: REPOSITORY, connection: CONNECTION, pat: 'p' });

		expect(result).toBe('polling');
		expect(repositoryRepo.saveGithubSyncMode).toHaveBeenCalledWith({ id: 'repo_1', syncMode: 'polling' });
	});
});
