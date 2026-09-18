import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { AzureError } from 'src/services/azure/azure-devops.service';
import { GithubError } from 'src/services/github/github-app.service';

// A caller through `gitProviderFor` no longer knows which provider it is
// talking to, so it needs one check that covers both a `GithubError` and an
// `AzureError` — and, since `gitProviderFor` itself throws a plain
// `HttpError(409, …)` for a repository whose connection is gone or broken, that
// too: the same "not connected" fact a build's `failureReason` already
// reported for GitHub before this seam existed.
export function gitProviderFailureMessage(error: unknown): string | null {
	if (error instanceof GithubError || error instanceof AzureError) {
		return error.message;
	}

	if (error instanceof HttpError && error.statusCode === 409) {
		return error.message;
	}

	return null;
}

// The synchronous-request equivalent of `gitProviderFailureMessage`: for a route
// handler that must answer with a status code rather than write a build's
// `failureReason`. Defers to `toGithubHttpError` for everything but an
// `AzureError`, so the two providers' mapping — a 401 (or Azure's dead-token
// kind) reads as a client-side mistake, anything else the App/PAT refused
// reaches the browser as a 502 rather than collapsing into "Internal server
// error" — stays defined in exactly one place each.
export function toGitProviderHttpError(error: unknown): Error {
	if (error instanceof AzureError) {
		return new HttpError(error.kind === 'invalid_token' ? 400 : 502, error.message, { cause: error });
	}

	return toGithubHttpError(error);
}
