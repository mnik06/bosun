import { describe, expect, it, vi } from 'vitest';
import { attachGithubRepository } from 'src/controllers/machines/attach-repository';
import { type Machine } from 'src/types/MachineSchema';
import { type Repository } from 'src/types/RepositorySchema';

const MACHINE: Machine = {
	id: 'm_1',
	projectId: 'prj_1',
	name: 'box',
	status: 'online',
	lastSeenAt: new Date(),
	repoPath: null,
	agentVersion: '9.0.0',
	capabilities: null,
	projectProfile: null,
	envSets: null,
	repositoryId: 'repo_1',
	publicKey: null,
	policy: { applyMigrations: true, confirmed: true },
	sessionSecrets: null,
	verifyLanes: 1,
	buildCap: null,
	ignoreMemoryBudget: false,
	createdAt: new Date()
};

const REPOSITORY: Repository = {
	id: 'repo_1',
	projectId: 'prj_1',
	provider: 'github',
	installationId: null,
	githubRepoId: 7,
	githubPatConnectionId: 'gpc_old',
	syncMode: 'webhook',
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

function baseDeps() {
	// Mutable so the test can prove the fix end to end: 555 (the old
	// connection's webhook) until `clearGithubWebhookState` runs, then null —
	// the state `ensureGithubWebhookOnAttach` reads back to decide whether the
	// new connection still needs a webhook created for it.
	let webhookId: number | null = 555;
	const repositoryRepo = {
		getOwnedByGithubRepoId: vi.fn().mockResolvedValue(REPOSITORY),
		getGithubWebhookIdById: vi.fn(() => Promise.resolve(webhookId)),
		clearGithubWebhookState: vi.fn(() => {
			webhookId = null;

			return Promise.resolve(undefined);
		}),
		upsert: vi.fn().mockResolvedValue({ ...REPOSITORY, githubPatConnectionId: 'gpc_new', syncMode: null }),
		saveGithubWebhook: vi.fn((opts: { githubWebhookId: number }) => {
			webhookId = opts.githubWebhookId;

			return Promise.resolve(undefined);
		}),
		saveGithubSyncMode: vi.fn().mockResolvedValue(undefined)
	};
	const githubPatConnectionRepo = {
		getById: vi.fn((id: string) => Promise.resolve(id === 'gpc_old' ? { id: 'gpc_old', projectId: 'prj_1', githubLogin: 'old-owner', status: 'active' } : { id: 'gpc_new', projectId: 'prj_1', githubLogin: 'new-owner', status: 'active' })),
		getEncryptedTokenById: vi.fn((opts: { id: string }) => Promise.resolve(`encrypted:${opts.id}`)),
		listForProject: vi.fn().mockResolvedValue([
			{ id: 'gpc_old', projectId: 'prj_1', githubLogin: 'old-owner', status: 'active' },
			{ id: 'gpc_new', projectId: 'prj_1', githubLogin: 'new-owner', status: 'active' }
		])
	};
	const githubPat = {
		// Simulates the trigger for a PAT-to-PAT switch: the old connection
		// (`gpc_old`) no longer grants this repository — a revoked or narrowed
		// token — while the newly connected one (`gpc_new`) does.
		listPushableRepositories: vi.fn((pat: string) =>
			Promise.resolve(pat === 'decrypted:gpc_new' ? [{ githubRepoId: 7, fullName: 'acme/app', defaultBranch: 'main', private: false }] : [])
		),
		deleteWebhook: vi.fn().mockResolvedValue(undefined),
		createWebhook: vi.fn().mockResolvedValue({ githubWebhookId: 999 })
	};
	const machineRepo = {
		getOwnedById: vi.fn().mockResolvedValue(MACHINE),
		setRepository: vi.fn().mockResolvedValue(MACHINE)
	};
	const socketRegistry = {
		getAgentSocket: vi.fn().mockReturnValue({}),
		sendToAgent: vi.fn().mockResolvedValue(true),
		broadcastToUi: vi.fn()
	};

	return {
		machineRepo,
		repositoryRepo,
		githubInstallationRepo: { listForProject: vi.fn().mockResolvedValue([]) },
		githubPatConnectionRepo,
		projectMemberRepo: { list: vi.fn().mockResolvedValue([]) },
		notificationRepo: { create: vi.fn() },
		pushSubscriptionRepo: { listByUserIds: vi.fn().mockResolvedValue([]) },
		buildRepo: { listForMachine: vi.fn().mockResolvedValue([]) },
		githubApp: { listRepositories: vi.fn().mockResolvedValue([]) },
		githubPat,
		patEncryption: { decrypt: vi.fn((value: string) => value.replace('encrypted:', 'decrypted:')), encrypt: vi.fn((value: string) => value) },
		keyService: { generateWebhookSecret: () => 'new-secret' },
		githubPatConnectionGuard: { isRateLimited: vi.fn().mockReturnValue(false), run: (_id: string, run: () => unknown) => run() },
		idService: { createRepositoryId: () => 'repo_1' },
		socketRegistry,
		webPush: { send: vi.fn() },
		appUrl: 'https://app.example.com',
		serverUrl: 'https://bosun.example',
		id: 'm_1',
		projectId: 'prj_1',
		githubRepoId: 7
	};
}

describe('attachGithubRepository switching PAT connections', () => {
	it('deletes the old connection\'s webhook and clears the stale DB columns before the new connection gets its own webhook (AC-61, AC-62)', async () => {
		const deps = baseDeps() as unknown as Parameters<typeof attachGithubRepository>[0];

		await attachGithubRepository(deps);

		const repositoryRepo = (deps as unknown as ReturnType<typeof baseDeps>).repositoryRepo;
		const githubPat = (deps as unknown as ReturnType<typeof baseDeps>).githubPat;
		const githubPatConnectionRepo = (deps as unknown as ReturnType<typeof baseDeps>).githubPatConnectionRepo;

		expect(githubPatConnectionRepo.getEncryptedTokenById).toHaveBeenCalledWith({ id: 'gpc_old', projectId: 'prj_1' });
		expect(githubPat.deleteWebhook).toHaveBeenCalledWith({ pat: 'decrypted:gpc_old', fullName: 'acme/app', webhookId: 555 });

		const clearOrder = repositoryRepo.clearGithubWebhookState.mock.invocationCallOrder[0];
		const upsertOrder = repositoryRepo.upsert.mock.invocationCallOrder[0];

		expect(clearOrder).toBeLessThan(upsertOrder);

		// The bug this guards against: without the fix, `getGithubWebhookIdById`
		// would still answer 555 (the deleted connection's stale id) by the time
		// `ensureGithubWebhookOnAttach` asks, so it would skip creating a webhook
		// for the new connection entirely.
		expect(githubPat.createWebhook).toHaveBeenCalledWith({ pat: 'decrypted:gpc_new', fullName: 'acme/app', url: 'https://bosun.example/github/webhook/repo_1', secret: 'new-secret' });
		expect(repositoryRepo.saveGithubWebhook).toHaveBeenCalledWith({ id: 'repo_1', webhookSecretEncrypted: 'new-secret', githubWebhookId: 999, syncMode: 'webhook' });
	});
});
