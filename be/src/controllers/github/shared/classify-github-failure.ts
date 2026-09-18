import { GithubError } from 'src/services/github/github-app.service';
import { GithubPatError, type GithubPatErrorKind } from 'src/services/github/github-pat.service';

// Both the App-token REST calls (`github-app.service.ts`, used for PR and
// branch operations on a PAT-connected repository too — see
// `git-provider-for.ts`) and this module's own webhook/branch-polling calls
// throw a different error class, so a caller reacting to a break needs to
// reduce either shape to the same kind (AC-43..46, AC-70). Only GitHub's
// PAT-issuing calls ever throw `GithubPatError`; a `GithubError` is classified
// here from its status and message the same way `classifyForbidden` reads a
// fresh 403 body — a 403 that matches neither SSO nor an org-policy wording
// stays `missing_scope`, the kind that never breaks the whole connection
// (AC-70).
export function classifyGithubFailure(error: unknown): { kind: GithubPatErrorKind; message: string; ssoUrl?: string } | null {
	if (error instanceof GithubPatError) {
		return { kind: error.kind, message: error.message, ssoUrl: error.ssoUrl };
	}

	if (!(error instanceof GithubError)) {
		return null;
	}

	if (error.status === 401) {
		return { kind: 'invalid_token', message: error.message };
	}

	if (error.status === 403) {
		if (error.ssoUrl !== undefined) {
			return { kind: 'sso_required', message: error.message, ssoUrl: error.ssoUrl };
		}

		if (/saml enforcement/i.test(error.message)) {
			return { kind: 'sso_required', message: error.message };
		}

		if (/(oauth app access|personal access token) (restriction|polic)/i.test(error.message) || /restricts (personal access )?tokens?/i.test(error.message)) {
			return { kind: 'org_restricted', message: error.message };
		}

		return { kind: 'missing_scope', message: error.message };
	}

	return null;
}
