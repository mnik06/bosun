import { z } from 'zod';

export const GithubPatConnectionStatusSchema = z.enum(['active', 'broken']);

export type GithubPatConnectionStatus = z.infer<typeof GithubPatConnectionStatusSchema>;

export const GithubTokenTypeSchema = z.enum(['fine_grained', 'classic']);

export type GithubTokenType = z.infer<typeof GithubTokenTypeSchema>;

// The PAT itself is never on this shape — `encrypted_token` stays inside the repo
// layer, read only by the controllers that mint a token or re-validate one, the
// same containment `AzureConnectionSchema` gives its own PAT.
export const GithubPatConnectionSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	githubLogin: z.string(),
	tokenType: GithubTokenTypeSchema,
	status: GithubPatConnectionStatusSchema,
	lastError: z.string().nullable(),
	brokenAt: z.date().nullable(),
	createdByUserId: z.string().nullable(),
	createdAt: z.date()
});

export type GithubPatConnection = z.infer<typeof GithubPatConnectionSchema>;

const FINE_GRAINED_PREFIX = 'github_pat_';

// GitHub's own tell: a fine-grained token always carries this prefix, everything
// else — `ghp_...` and the legacy 40-character hex form — is classic (AC-4).
export function detectGithubTokenKind(pat: string): GithubTokenType {
	return pat.startsWith(FINE_GRAINED_PREFIX) ? 'fine_grained' : 'classic';
}
