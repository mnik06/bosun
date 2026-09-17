import { z } from 'zod';

export const GithubInstallationSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	installationId: z.number().int(),
	accountLogin: z.string(),
	createdByUserId: z.string().nullable(),
	createdAt: z.date()
});

export type GithubInstallation = z.infer<typeof GithubInstallationSchema>;

export const RepositoryProviderSchema = z.enum(['github', 'azure_devops']);

export type RepositoryProvider = z.infer<typeof RepositoryProviderSchema>;

// `installationId`/`githubRepoId` and `azureConnectionId`/`azureProjectId`/
// `azureRepoId` are mutually exclusive, set by `provider` — enforced by the two
// repo-layer upserts (`upsert` for github, `upsertAzure` for azure_devops) never
// the other side's columns, not by a database constraint. Within `provider ===
// 'github'`, `installationId` and `githubPatConnectionId` are themselves mutually
// exclusive, enforced the same way by `upsert`.
export const RepositorySchema = z.object({
	id: z.string(),
	projectId: z.string(),
	provider: RepositoryProviderSchema,
	installationId: z.string().nullable(),
	githubRepoId: z.number().int().nullable(),
	githubPatConnectionId: z.string().nullable(),
	// PAT-connected GitHub repositories only — whether bosun's webhook is healthy
	// or it fell back to polling. Null for an App-connected repository (which
	// always has a webhook) and for Azure. Mirrors `azureSyncMode`.
	syncMode: z.enum(['webhook', 'polling']).nullable(),
	azureConnectionId: z.string().nullable(),
	azureProjectId: z.string().nullable(),
	azureRepoId: z.string().nullable(),
	fullName: z.string(),
	defaultBranch: z.string(),
	configDraft: z.string().nullable(),
	// Reported by an agent that has the clone, never looked up here: it is a fact
	// about the default branch as that machine last fetched it.
	configOnDefault: z.boolean(),
	// Whether an integration may hand a real conflict to a session. Off, a conflict
	// outside `regenerate` paths goes straight to needs you.
	autoResolveConflicts: z.boolean(),
	// Azure only — the UI's "last synced" line. Null for a GitHub repository and
	// for an Azure one bosun has not yet reconciled.
	lastSyncedAt: z.date().nullable(),
	// Azure only — whether bosun's webhook subscriptions are healthy or it fell
	// back to polling. Null for GitHub and for an Azure repository not yet
	// reconciled even once.
	azureSyncMode: z.enum(['webhook', 'polling']).nullable(),
	createdAt: z.date()
});

export type Repository = z.infer<typeof RepositorySchema>;

// What one connection grants, as GitHub reports it — either an installation or a
// PAT connection. Not stored: the picker is asked fresh, so a repository removed
// from the connection disappears from it.
export const GithubRepositoryConnectionSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('app'), installationId: z.string(), accountLogin: z.string() }),
	z.object({ kind: z.literal('pat'), connectionId: z.string(), githubLogin: z.string() })
]);

export type GithubRepositoryConnection = z.infer<typeof GithubRepositoryConnectionSchema>;

// The merged picker: every repository an App installation or a PAT connection
// grants, deduped by `githubRepoId` with the App winning (AC-22).
export const AvailableRepositorySchema = z.object({
	githubRepoId: z.number().int(),
	fullName: z.string(),
	defaultBranch: z.string(),
	private: z.boolean(),
	connection: GithubRepositoryConnectionSchema
});

export type AvailableRepository = z.infer<typeof AvailableRepositorySchema>;

// A directory name on the machine, derived from the full name so two
// repositories of the same name under different owners cannot share one.
export function toRepositorySlug(fullName: string): string {
	return fullName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}
