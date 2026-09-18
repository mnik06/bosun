import { runGithubPatConnectionCall, type GithubPatConnectionGuardDeps } from 'src/controllers/github/shared/pat-connection-guard';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { GithubPatError, type GithubPatService } from 'src/services/github/github-pat.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type KeyService } from 'src/services/keys/key.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';
import { type Repository } from 'src/types/RepositorySchema';

export interface GithubWebhookSyncDeps extends GithubPatConnectionGuardDeps {
	repositoryRepo: RepositoryRepo;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	keyService: KeyService;
	serverUrl: string;
}

function webhookUrl(opts: { serverUrl: string; repositoryId: string }): string {
	return `${opts.serverUrl}/github/webhook/${opts.repositoryId}`;
}

// AC-63: a create that 422s means GitHub already has a hook for this exact
// URL — bosun's own local row lost track of it (a race between two attaches,
// or a row recreated after being deleted) — so it is adopted under a fresh
// secret rather than treated as a failure. `createWebhook`/`updateWebhookSecret`
// both run inside the connection guard, so an invalid-token or SSO break here
// still flips the connection broken exactly as any other call against it would.
async function createOrAdoptWebhook(deps: GithubWebhookSyncDeps, opts: { repository: Repository; connection: GithubPatConnection; pat: string; url: string; secret: string }): Promise<number> {
	return runGithubPatConnectionCall(deps, opts.connection, async () => {
		try {
			const created = await deps.githubPat.createWebhook({ pat: opts.pat, fullName: opts.repository.fullName, url: opts.url, secret: opts.secret });

			return created.githubWebhookId;
		} catch (error) {
			if (!(error instanceof GithubPatError) || error.kind !== 'webhook_exists') {
				throw error;
			}

			const hooks = await deps.githubPat.listWebhooks({ pat: opts.pat, fullName: opts.repository.fullName });
			const existing = hooks.find((hook) => hook.url === opts.url);

			if (!existing) {
				throw error;
			}

			await deps.githubPat.updateWebhookSecret({ pat: opts.pat, fullName: opts.repository.fullName, webhookId: existing.id, url: opts.url, secret: opts.secret });

			return existing.id;
		}
	});
}

// The create-or-adopt-and-persist tail both entry points share: try the
// create, store the webhook and report 'webhook' on success, or fall back to
// polling and report 'polling' on a `GithubPatError` — anything else propagates.
async function attemptWebhookCreate(deps: GithubWebhookSyncDeps, opts: { repository: Repository; connection: GithubPatConnection; pat: string }): Promise<'webhook' | 'polling'> {
	const url = webhookUrl({ serverUrl: deps.serverUrl, repositoryId: opts.repository.id });
	const secret = deps.keyService.generateWebhookSecret();

	try {
		const githubWebhookId = await createOrAdoptWebhook(deps, { ...opts, url, secret });

		await deps.repositoryRepo.saveGithubWebhook({ id: opts.repository.id, webhookSecretEncrypted: deps.patEncryption.encrypt(secret), githubWebhookId, syncMode: 'webhook' });

		return 'webhook';
	} catch (error) {
		await deps.repositoryRepo.saveGithubSyncMode({ id: opts.repository.id, syncMode: 'polling' });

		if (!(error instanceof GithubPatError)) {
			throw error;
		}

		return 'polling';
	}
}

// Called once, right after a repository row is attached through a PAT
// connection for the first time (AC-35). A second machine attaching an
// already-known row finds a webhook id already stored and does nothing
// (AC-63). A refusal — most often a 403, the token never granted
// `admin:repo_hook` — leaves the repository on polling and never fails the
// attach itself (AC-36): the git side of the attach already succeeded, and a
// sync convenience is not worth undoing it for.
export async function ensureGithubWebhookOnAttach(deps: GithubWebhookSyncDeps, opts: { repository: Repository; connection: GithubPatConnection; pat: string }): Promise<void> {
	const existingWebhookId = await deps.repositoryRepo.getGithubWebhookIdById(opts.repository.id);

	if (existingWebhookId !== null) {
		return;
	}

	await attemptWebhookCreate(deps, opts);
}

// Run on the sync job's timer for every PAT-connected GitHub repository
// (AC-38): a webhook's live status is asked of GitHub directly, since the
// local row only proves bosun once created it, not that it still exists or is
// active. Missing and disabled are treated the same — recreate it.
export async function reconcileGithubWebhook(deps: GithubWebhookSyncDeps, opts: { repository: Repository; connection: GithubPatConnection; pat: string }): Promise<'webhook' | 'polling'> {
	const existingWebhookId = await deps.repositoryRepo.getGithubWebhookIdById(opts.repository.id);

	const healthy =
		existingWebhookId === null
			? false
			: await runGithubPatConnectionCall(deps, opts.connection, async () => {
				const hook = await deps.githubPat.getWebhook({ pat: opts.pat, fullName: opts.repository.fullName, webhookId: existingWebhookId });

				return hook?.active === true;
			});

	if (healthy) {
		await deps.repositoryRepo.saveGithubSyncMode({ id: opts.repository.id, syncMode: 'webhook' });

		return 'webhook';
	}

	return attemptWebhookCreate(deps, opts);
}
