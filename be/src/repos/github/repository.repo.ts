import { and, asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { repositories } from 'src/services/drizzle/schema';
import { RepositorySchema, type Repository } from 'src/types/RepositorySchema';

const columns = {
	id: repositories.id,
	projectId: repositories.projectId,
	provider: repositories.provider,
	installationId: repositories.installationId,
	githubRepoId: repositories.githubRepoId,
	githubPatConnectionId: repositories.githubPatConnectionId,
	syncMode: repositories.syncMode,
	azureConnectionId: repositories.azureConnectionId,
	azureProjectId: repositories.azureProjectId,
	azureRepoId: repositories.azureRepoId,
	fullName: repositories.fullName,
	defaultBranch: repositories.defaultBranch,
	configDraft: repositories.configDraft,
	configOnDefault: repositories.configOnDefault,
	autoResolveConflicts: repositories.autoResolveConflicts,
	lastSyncedAt: repositories.lastSyncedAt,
	azureSyncMode: repositories.azureSyncMode,
	createdAt: repositories.createdAt
};

export function getRepositoryRepo(db: DbOrTx) {
	return {
		// Picking a repository for a machine is what creates its row, so the second
		// machine on it lands on the same row — its draft, its onboarding runs. What
		// GitHub says now wins: a renamed repository or a changed default branch.
		// `connection` names exactly one side of the App/PAT split; writing both
		// columns on every call (one of them always null) is what keeps them
		// mutually exclusive when a repository is re-attached through the other
		// connection kind, rather than leaving the old side's id stale.
		async upsert(
			opts: {
				id: string;
				projectId: string;
				githubRepoId: number;
				fullName: string;
				defaultBranch: string;
			} & ({ installationId: string; githubPatConnectionId?: undefined } | { installationId?: undefined; githubPatConnectionId: string })
		): Promise<Repository> {
			const installationId = opts.installationId ?? null;
			const githubPatConnectionId = opts.githubPatConnectionId ?? null;
			const [row] = await db
				.insert(repositories)
				.values({ ...opts, installationId, githubPatConnectionId })
				.onConflictDoUpdate({
					target: [repositories.projectId, repositories.githubRepoId],
					set: {
						installationId,
						githubPatConnectionId,
						fullName: opts.fullName,
						defaultBranch: opts.defaultBranch,
						// App-connected repositories never carry a PAT webhook — attaching
						// through the App clears whatever a previous PAT connection left, so
						// re-attaching away from a PAT connection never leaves its secret,
						// GitHub webhook id, or sync mode stale on the row.
						...(installationId === null ? {} : { webhookSecretEncrypted: null, githubWebhookId: null, syncMode: null })
					}
				})
				.returning(columns);

			return RepositorySchema.parse(row);
		},

		// Same identity-picks-the-row rule as GitHub's `upsert`, keyed on the azure repo
		// GUID instead: attaching an already-known repository to a second machine
		// finds the same row rather than creating a duplicate (AC-30).
		async upsertAzure(opts: {
			id: string;
			projectId: string;
			azureConnectionId: string;
			azureProjectId: string;
			azureRepoId: string;
			fullName: string;
			defaultBranch: string;
		}): Promise<Repository> {
			const [row] = await db
				.insert(repositories)
				.values({ ...opts, provider: 'azure_devops' })
				.onConflictDoUpdate({
					target: [repositories.projectId, repositories.azureRepoId],
					set: {
						azureConnectionId: opts.azureConnectionId,
						azureProjectId: opts.azureProjectId,
						fullName: opts.fullName,
						defaultBranch: opts.defaultBranch
					}
				})
				.returning(columns);

			return RepositorySchema.parse(row);
		},

		// Every repository an Azure connection owns, so disconnect knows which
		// webhook subscriptions to delete from Azure before the cascade drops them.
		async listForAzureConnection(azureConnectionId: string): Promise<Repository[]> {
			const rows = await db.select(columns).from(repositories).where(eq(repositories.azureConnectionId, azureConnectionId));

			return rows.map((row) => RepositorySchema.parse(row));
		},

		// The GitHub PAT equivalent — every repository a connection owns, so
		// disconnecting it can announce every machine that loses its clone.
		async listForGithubPatConnection(githubPatConnectionId: string): Promise<Repository[]> {
			const rows = await db.select(columns).from(repositories).where(eq(repositories.githubPatConnectionId, githubPatConnectionId));

			return rows.map((row) => RepositorySchema.parse(row));
		},

		async listForProject(projectId: string): Promise<Repository[]> {
			const rows = await db
				.select(columns)
				.from(repositories)
				.where(eq(repositories.projectId, projectId))
				.orderBy(asc(repositories.fullName));

			return rows.map((row) => RepositorySchema.parse(row));
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<Repository | null> {
			const [row] = await db
				.select(columns)
				.from(repositories)
				.where(and(eq(repositories.id, opts.id), eq(repositories.projectId, opts.projectId)));

			return row ? RepositorySchema.parse(row) : null;
		},

		// Unscoped: reached from a machine row the caller has already authenticated.
		async getById(id: string): Promise<Repository | null> {
			const [row] = await db.select(columns).from(repositories).where(eq(repositories.id, id));

			return row ? RepositorySchema.parse(row) : null;
		},

		// Excluded from `columns` for the same reason `azureConnectionRepo` keeps its
		// PAT off every column list: a per-repository webhook secret is a credential,
		// never returned by anything that answers with a `Repository`.
		async getWebhookSecretEncryptedById(id: string): Promise<string | null> {
			const [row] = await db.select({ webhookSecretEncrypted: repositories.webhookSecretEncrypted }).from(repositories).where(eq(repositories.id, id));

			return row?.webhookSecretEncrypted ?? null;
		},

		async saveConfigDraft(opts: { id: string; configDraft: string }): Promise<Repository | null> {
			const [row] = await db
				.update(repositories)
				.set({ configDraft: opts.configDraft })
				.where(eq(repositories.id, opts.id))
				.returning(columns);

			return row ? RepositorySchema.parse(row) : null;
		},

		// A webhook names the repository by GitHub's id, and the same repository can be
		// connected to more than one project.
		async listByGithubRepoId(githubRepoId: number): Promise<Repository[]> {
			const rows = await db.select(columns).from(repositories).where(eq(repositories.githubRepoId, githubRepoId));

			return rows.map((row) => RepositorySchema.parse(row));
		},

		async saveAutoResolve(opts: { id: string; projectId: string; autoResolveConflicts: boolean }): Promise<Repository | null> {
			const [row] = await db
				.update(repositories)
				.set({ autoResolveConflicts: opts.autoResolveConflicts })
				.where(and(eq(repositories.id, opts.id), eq(repositories.projectId, opts.projectId)))
				.returning(columns);

			return row ? RepositorySchema.parse(row) : null;
		},

		async saveConfigOnDefault(opts: { id: string; configOnDefault: boolean }): Promise<Repository | null> {
			const [row] = await db
				.update(repositories)
				.set({ configOnDefault: opts.configOnDefault })
				.where(eq(repositories.id, opts.id))
				.returning(columns);

			return row ? RepositorySchema.parse(row) : null;
		},

		// Unscoped, like `buildRepo.listWithOpenPullRequests` — read by the
		// background sync job for every project at once, not from a request that
		// already knows which project it is in.
		async listAllAzure(): Promise<Repository[]> {
			const rows = await db.select(columns).from(repositories).where(eq(repositories.provider, 'azure_devops'));

			return rows.map((row) => RepositorySchema.parse(row));
		},

		async markSynced(id: string): Promise<void> {
			await db.update(repositories).set({ lastSyncedAt: new Date() }).where(eq(repositories.id, id));
		},

		async saveAzureSyncMode(opts: { id: string; azureSyncMode: 'webhook' | 'polling' }): Promise<void> {
			await db.update(repositories).set({ azureSyncMode: opts.azureSyncMode }).where(eq(repositories.id, opts.id));
		}
	};
}

export type RepositoryRepo = ReturnType<typeof getRepositoryRepo>;
