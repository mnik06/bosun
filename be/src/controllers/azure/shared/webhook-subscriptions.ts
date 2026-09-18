import { runAzureConnectionCall, type AzureConnectionGuardDeps } from 'src/controllers/azure/shared/connection-guard';
import { type AzureWebhookSubscription, type AzureWebhookSubscriptionRepo } from 'src/repos/azure/azure-webhook-subscription.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { AzureError, type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type IdService } from 'src/services/ids/id.service';
import { type KeyService } from 'src/services/keys/key.service';
import { type AzureConnection } from 'src/types/AzureSchema';
import { type Repository } from 'src/types/RepositorySchema';

export interface WebhookSyncDeps extends AzureConnectionGuardDeps {
	azureWebhookSubscriptionRepo: AzureWebhookSubscriptionRepo;
	repositoryRepo: RepositoryRepo;
	azureDevOps: AzureDevOpsService;
	idService: IdService;
	keyService: KeyService;
	serverUrl: string;
}

const EVENT_TYPES = ['git.push', 'git.pullrequest.updated'] as const;

function webhookUrl(opts: { serverUrl: string; repositoryId: string }): string {
	return `${opts.serverUrl}/azure/webhook/${opts.repositoryId}`;
}

// Both of a repository's subscriptions are (re)created together under one
// fresh secret: Azure has no call to update an existing subscription's
// consumer secret, and keeping the pair in step is simpler than patching only
// the one reconciliation found unhealthy. Any subscription this replaces is
// deleted from Azure first, best-effort, so recreating an unhealthy pair on
// every reconcile tick does not leave a growing trail of orphaned live
// subscriptions once the local row is overwritten with the new ids.
async function createPair(deps: WebhookSyncDeps, opts: { repository: Repository; connection: AzureConnection; pat: string; existing: AzureWebhookSubscription[] }): Promise<void> {
	const url = webhookUrl({ serverUrl: deps.serverUrl, repositoryId: opts.repository.id });

	// AC-58: never registered with Azure except over HTTPS — true of every real
	// deployment, and false only for a local `http://` dev server, which falls
	// back to polling the same way a refused subscription does rather than
	// handing Azure a URL it could not call back on anyway.
	if (!url.startsWith('https://')) {
		throw new AzureError('other', 'bosun is not reachable over HTTPS, so Azure cannot be given a webhook URL to call back on');
	}

	await Promise.all(
		opts.existing.map((subscription) =>
			deps.azureDevOps.deleteSubscription({ organization: opts.connection.organization, pat: opts.pat, azureSubscriptionId: subscription.azureSubscriptionId })
		)
	);

	const secret = deps.keyService.generateWebhookSecret();
	const secretHash = deps.keyService.hashWebhookSecret(secret);

	for (const eventType of EVENT_TYPES) {
		const created = await runAzureConnectionCall(deps, opts.connection, () =>
			deps.azureDevOps.createSubscription({
				organization: opts.connection.organization,
				pat: opts.pat,
				// Attach already proved these are set for an Azure repository row.
				azureProjectId: opts.repository.azureProjectId!,
				azureRepoId: opts.repository.azureRepoId!,
				eventType,
				url,
				secret
			})
		);

		await deps.azureWebhookSubscriptionRepo.upsert({
			id: deps.idService.createAzureWebhookSubscriptionId(),
			repositoryId: opts.repository.id,
			eventType,
			azureSubscriptionId: created.azureSubscriptionId,
			secretHash
		});
	}
}

// The create-pair-and-persist tail both entry points share: (re)create the
// subscription pair and report 'webhook' on success, or fall back to polling
// and report 'polling' on an `AzureError` — anything else propagates.
async function attemptWebhookSubscriptionCreate(
	deps: WebhookSyncDeps,
	opts: { repository: Repository; connection: AzureConnection; pat: string; existing: AzureWebhookSubscription[] }
): Promise<'webhook' | 'polling'> {
	try {
		await createPair(deps, opts);
		await deps.repositoryRepo.saveAzureSyncMode({ id: opts.repository.id, azureSyncMode: 'webhook' });

		return 'webhook';
	} catch (error) {
		await deps.repositoryRepo.saveAzureSyncMode({ id: opts.repository.id, azureSyncMode: 'polling' });

		if (!(error instanceof AzureError)) {
			throw error;
		}

		return 'polling';
	}
}

// Called once, right after a repository row is attached for the first time
// (AC-53). A second machine attaching an already-known row finds both
// subscriptions already present and does nothing (AC-55). A refusal — most
// often a 403, the PAT's custom scopes not granting the service-hooks scope —
// leaves the repository on polling and never fails the attach itself (AC-62):
// the git side of the attach already succeeded, and a sync convenience is not
// worth undoing it for.
export async function ensureAzureWebhookSubscriptionsOnAttach(
	deps: WebhookSyncDeps,
	opts: { repository: Repository; connection: AzureConnection; pat: string }
): Promise<void> {
	const existing = await deps.azureWebhookSubscriptionRepo.listForRepositoryIds([opts.repository.id]);

	if (existing.length >= EVENT_TYPES.length) {
		return;
	}

	await attemptWebhookSubscriptionCreate(deps, { ...opts, existing });
}

// Run on the sync job's timer for every Azure repository (AC-64): a
// subscription's live status is asked of Azure directly, since the local row
// only proves bosun once created it, not that it is still healthy. Missing,
// disabled or on-probation is treated the same — recreate the pair.
export async function reconcileAzureWebhookSubscriptions(
	deps: WebhookSyncDeps,
	opts: { repository: Repository; connection: AzureConnection; pat: string }
): Promise<'webhook' | 'polling'> {
	const existing = await deps.azureWebhookSubscriptionRepo.listForRepositoryIds([opts.repository.id]);
	const byEvent = new Map(existing.map((row) => [row.eventType, row]));

	const unhealthy: boolean[] = [];

	for (const eventType of EVENT_TYPES) {
		const row = byEvent.get(eventType);

		if (!row) {
			unhealthy.push(true);
			continue;
		}

		const status = await runAzureConnectionCall(deps, opts.connection, () =>
			deps.azureDevOps.getSubscriptionStatus({ organization: opts.connection.organization, pat: opts.pat, azureSubscriptionId: row.azureSubscriptionId })
		);

		unhealthy.push(status !== 'enabled');
	}

	if (!unhealthy.some(Boolean)) {
		await deps.repositoryRepo.saveAzureSyncMode({ id: opts.repository.id, azureSyncMode: 'webhook' });

		return 'webhook';
	}

	return attemptWebhookSubscriptionCreate(deps, { ...opts, existing });
}
