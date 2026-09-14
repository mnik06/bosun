import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type GithubAppService } from 'src/services/github/github-app.service';

// The installations the signed-in GitHub user can reach, proven with their own
// authorization. It is the only source an installation is ever recorded from: an
// installation id from anywhere else is a number anyone can type.
export async function accessibleInstallations(opts: {
	githubApp: GithubAppService;
	userId: string;
	projectId: string;
	code: string;
	state: string;
}): Promise<{ installationId: number; accountLogin: string }[]> {
	if (!opts.githubApp.verifyState({ state: opts.state, userId: opts.userId, projectId: opts.projectId })) {
		throw new HttpError(403, 'This GitHub connection was started by someone else, for another project, or too long ago — start it again');
	}

	try {
		return await opts.githubApp.installationsForCode(opts.code);
	} catch (error) {
		throw toGithubHttpError(error);
	}
}
