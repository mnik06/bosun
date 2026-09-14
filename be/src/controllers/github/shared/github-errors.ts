import { HttpError } from 'src/api/errors/HttpError';
import { GithubError } from 'src/services/github/github-app.service';

// GitHub refusing is a fact the leader can act on — an App removed from an
// organization, a repository no longer granted — so its words reach the browser
// as a 502 rather than collapsing into "Internal server error".
export function toGithubHttpError(error: unknown): Error {
	if (error instanceof HttpError) {
		return error;
	}

	if (error instanceof GithubError) {
		return new HttpError(error.status === 401 ? 400 : 502, error.message, { cause: error });
	}

	return error instanceof Error ? error : new Error(String(error));
}
