import { z } from 'zod';

export const AzureConnectionStatusSchema = z.enum(['active', 'broken']);

export type AzureConnectionStatus = z.infer<typeof AzureConnectionStatusSchema>;

// The PAT itself is never on this shape — `encrypted_pat` stays inside the repo
// layer, read only by the controllers that mint a token or re-validate one.
export const AzureConnectionSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	organization: z.string(),
	status: AzureConnectionStatusSchema,
	lastError: z.string().nullable(),
	brokenAt: z.date().nullable(),
	createdByUserId: z.string().nullable(),
	createdAt: z.date()
});

export type AzureConnection = z.infer<typeof AzureConnectionSchema>;

// What a connection's PAT can see, as Azure reports it across every project in
// the organization. Not stored: the picker is asked fresh, same as GitHub's.
export const AvailableAzureRepositorySchema = z.object({
	azureConnectionId: z.string(),
	organization: z.string(),
	azureProjectId: z.string(),
	azureProjectName: z.string(),
	azureRepoId: z.string(),
	// `{org}/{project}/{repo}` — three segments, not two, so a repository cannot
	// collide on disk or on screen with a same-named one in another org or project.
	fullName: z.string(),
	defaultBranch: z.string(),
	cloneUrl: z.string(),
	private: z.boolean()
});

export type AvailableAzureRepository = z.infer<typeof AvailableAzureRepositorySchema>;

const ORG_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

// Accepts a bare org name, `https://dev.azure.com/{org}`, or the legacy
// `https://{org}.visualstudio.com`, and reduces any of the three to the slug —
// the only form bosun stores or sends to Azure's REST API. Anything else, or
// unreadable, and the caller decides what to tell the user (AC-12).
export function normalizeAzureOrganization(input: string): string | null {
	const trimmed = input.trim();

	if (trimmed === '') {
		return null;
	}

	if (ORG_NAME.test(trimmed)) {
		return trimmed;
	}

	try {
		const url = new URL(trimmed);
		const devAzureMatch = /^\/([^/]+)\/?$/.exec(url.pathname);

		if (url.hostname === 'dev.azure.com' && devAzureMatch) {
			return ORG_NAME.test(devAzureMatch[1]) ? devAzureMatch[1] : null;
		}

		const legacyMatch = /^([A-Za-z0-9][A-Za-z0-9-]*)\.visualstudio\.com$/.exec(url.hostname);

		if (legacyMatch) {
			return legacyMatch[1];
		}
	} catch {
		return null;
	}

	return null;
}

export function azureRepositoryFullName(opts: { organization: string; projectName: string; repoName: string }): string {
	return `${opts.organization}/${opts.projectName}/${opts.repoName}`;
}

// Deterministic — Azure's own `remoteUrl` carries a `{org}@` prefix meant for
// interactive git, which a machine's credential helper never needs (AC-32).
export function azureCloneUrl(opts: { organization: string; projectName: string; repoName: string }): string {
	return `https://dev.azure.com/${encodeURIComponent(opts.organization)}/${encodeURIComponent(opts.projectName)}/_git/${encodeURIComponent(opts.repoName)}`;
}

export function stripRefsHeadsPrefix(ref: string): string {
	return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}
