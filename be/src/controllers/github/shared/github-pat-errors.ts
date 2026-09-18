import { HttpError } from 'src/api/errors/HttpError';
import { GithubPatError, type GithubPatErrorKind } from 'src/services/github/github-pat.service';

// A PAT connect/rotate refusing is a fact the leader can act on, never an
// "Internal server error" — the six validation refusals (AC-6 through AC-11)
// answer 422, matching the API contract; a network problem or an unrecognized
// GitHub answer is bosun's or GitHub's own fault instead, so it gets 502.
const STATUS_BY_KIND: Record<GithubPatErrorKind, number> = {
	invalid_token: 422,
	missing_scope: 422,
	sso_required: 422,
	org_restricted: 422,
	pending_approval: 422,
	no_repositories: 422,
	rate_limited: 429,
	// Never reaches connect/rotate — only `createWebhook` throws it, and its own
	// caller (`ensureGithubWebhookOnAttach`) always catches it rather than
	// letting it reach this mapper. Kept for `STATUS_BY_KIND`'s exhaustiveness.
	webhook_exists: 502,
	unreachable: 502,
	other: 502
};

// `ssoUrl` rides along in `details` so the form can link straight to GitHub's own
// authorization page (AC-8) — `errorHandler` spreads `details` beside `message`.
export function toGithubPatHttpError(error: unknown): Error {
	if (error instanceof HttpError) {
		return error;
	}

	if (error instanceof GithubPatError) {
		return new HttpError(STATUS_BY_KIND[error.kind], error.message, {
			cause: error,
			...(error.ssoUrl === undefined ? {} : { details: { ssoUrl: error.ssoUrl } })
		});
	}

	return error instanceof Error ? error : new Error(String(error));
}
