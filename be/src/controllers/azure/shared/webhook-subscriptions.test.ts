import { describe, expect, it, vi } from 'vitest';
import { ensureAzureWebhookSubscriptionsOnAttach, reconcileAzureWebhookSubscriptions, type WebhookSyncDeps } from 'src/controllers/azure/shared/webhook-subscriptions';
import { getAzureConnectionGuardService } from 'src/services/azure/azure-connection-guard.service';
import { AzureError } from 'src/services/azure/azure-devops.service';
import { type AzureConnection } from 'src/types/AzureSchema';
import { type Repository } from 'src/types/RepositorySchema';

const connection: AzureConnection = {
	id: 'azc_1',
	projectId: 'prj_1',
	organization: 'my-org',
	status: 'active',
	lastError: null,
	brokenAt: null,
	createdByUserId: 'u_1',
	createdAt: new Date()
};

const repository = {
	id: 'repo_1',
	provider: 'azure_devops',
	azureConnectionId: 'azc_1',
	azureProjectId: 'proj-guid',
	azureRepoId: 'repo-guid',
	fullName: 'my-org/Proj/repo',
	defaultBranch: 'main'
} as unknown as Repository;

function build(opts: { existing?: unknown[]; createSubscription?: () => Promise<{ azureSubscriptionId: string }>; getSubscriptionStatus?: () => Promise<string> }) {
	const saveAzureSyncMode = vi.fn().mockResolvedValue(undefined);
	const upsert = vi.fn().mockResolvedValue(undefined);
	const listForRepositoryIds = vi.fn().mockResolvedValue(opts.existing ?? []);
	const createSubscription = vi.fn(opts.createSubscription ?? (() => Promise.resolve({ azureSubscriptionId: 'sub-1' })));
	const getSubscriptionStatus = vi.fn(opts.getSubscriptionStatus ?? (() => Promise.resolve('enabled')));
	const deleteSubscription = vi.fn().mockResolvedValue(undefined);

	const deps = {
		azureWebhookSubscriptionRepo: { listForRepositoryIds, upsert },
		repositoryRepo: { saveAzureSyncMode },
		azureDevOps: { createSubscription, getSubscriptionStatus, deleteSubscription },
		idService: { createAzureWebhookSubscriptionId: () => 'azwh_1' },
		keyService: { generateWebhookSecret: () => 'secret', hashWebhookSecret: (s: string) => `hash(${s})` },
		serverUrl: 'https://bosun.example.com',
		azureConnectionRepo: { markBroken: vi.fn() },
		projectMemberRepo: { list: vi.fn().mockResolvedValue([]) },
		azureConnectionGuard: getAzureConnectionGuardService(),
		notificationRepo: { create: vi.fn() },
		pushSubscriptionRepo: { listByUserIds: vi.fn().mockResolvedValue([]) },
		socketRegistry: { sendToUiUser: vi.fn() },
		webPush: { send: vi.fn() },
		appUrl: 'https://app.example.com'
	} as unknown as WebhookSyncDeps;

	return { deps, saveAzureSyncMode, upsert, listForRepositoryIds, createSubscription, getSubscriptionStatus, deleteSubscription };
}

describe('ensureAzureWebhookSubscriptionsOnAttach', () => {
	it('creates both subscriptions under one shared secret and marks the repository on webhook (AC-53, AC-56)', async () => {
		const { deps, upsert, createSubscription, saveAzureSyncMode } = build({});

		await ensureAzureWebhookSubscriptionsOnAttach(deps, { repository, connection, pat: 'token' });

		expect(createSubscription).toHaveBeenCalledTimes(2);
		expect(createSubscription.mock.calls.map((call) => call[0].eventType)).toEqual(['git.push', 'git.pullrequest.updated']);
		expect(upsert).toHaveBeenCalledTimes(2);
		expect(upsert.mock.calls[0][0].secretHash).toBe(upsert.mock.calls[1][0].secretHash);
		expect(saveAzureSyncMode).toHaveBeenCalledWith({ id: 'repo_1', azureSyncMode: 'webhook' });
	});

	it('does nothing when both subscriptions already exist (AC-55)', async () => {
		const { deps, createSubscription, saveAzureSyncMode } = build({
			existing: [{ eventType: 'git.push' }, { eventType: 'git.pullrequest.updated' }]
		});

		await ensureAzureWebhookSubscriptionsOnAttach(deps, { repository, connection, pat: 'token' });

		expect(createSubscription).not.toHaveBeenCalled();
		expect(saveAzureSyncMode).not.toHaveBeenCalled();
	});

	it('falls back to polling without throwing when Azure refuses (403 -> missing_scope) (AC-62)', async () => {
		const { deps, saveAzureSyncMode } = build({
			createSubscription: () => Promise.reject(new AzureError('missing_scope', 'no scope'))
		});

		await expect(ensureAzureWebhookSubscriptionsOnAttach(deps, { repository, connection, pat: 'token' })).resolves.toBeUndefined();
		expect(saveAzureSyncMode).toHaveBeenCalledWith({ id: 'repo_1', azureSyncMode: 'polling' });
	});
});

describe('reconcileAzureWebhookSubscriptions', () => {
	it('reports webhook and leaves subscriptions alone when both are enabled', async () => {
		const { deps, createSubscription } = build({
			existing: [
				{ eventType: 'git.push', azureSubscriptionId: 'sub-1' },
				{ eventType: 'git.pullrequest.updated', azureSubscriptionId: 'sub-2' }
			]
		});

		await expect(reconcileAzureWebhookSubscriptions(deps, { repository, connection, pat: 'token' })).resolves.toBe('webhook');
		expect(createSubscription).not.toHaveBeenCalled();
	});

	it('recreates both when one is missing, disabled or on probation (AC-64)', async () => {
		const { deps, createSubscription, deleteSubscription } = build({
			existing: [{ eventType: 'git.push', azureSubscriptionId: 'sub-1' }],
			getSubscriptionStatus: () => Promise.resolve('disabled')
		});

		await expect(reconcileAzureWebhookSubscriptions(deps, { repository, connection, pat: 'token' })).resolves.toBe('webhook');
		expect(createSubscription).toHaveBeenCalledTimes(2);
		// The superseded subscription is deleted from Azure so recreating an
		// unhealthy pair does not leave it as a live orphan.
		expect(deleteSubscription).toHaveBeenCalledWith(expect.objectContaining({ azureSubscriptionId: 'sub-1' }));
	});

	it('reports polling when recreation itself is refused', async () => {
		const { deps } = build({
			existing: [],
			createSubscription: () => Promise.reject(new AzureError('missing_scope', 'no scope'))
		});

		await expect(reconcileAzureWebhookSubscriptions(deps, { repository, connection, pat: 'token' })).resolves.toBe('polling');
	});
});
