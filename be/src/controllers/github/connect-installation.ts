import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';
import { type GithubInstallation } from 'src/types/RepositorySchema';

// The installation id arrives as a query parameter the browser copied off the
// callback URL, and anyone can type a number there. It is recorded only when the
// installing user's own GitHub authorization lists it — without that check, a
// leader of one project could attach another organization's installation and
// clone its code.
export async function connectInstallation(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	idService: IdService;
	userId: string;
	projectId: string;
	installationId: number;
	code: string;
	state: string;
}): Promise<GithubInstallation> {
	if (!opts.githubApp.verifyState({ state: opts.state, userId: opts.userId, projectId: opts.projectId })) {
		throw new HttpError(403, 'This GitHub connection was started by someone else, for another project, or too long ago — start it again');
	}

	const accessible = await opts.githubApp
		.installationsForCode(opts.code)
		.catch((error: unknown) => {
			throw toGithubHttpError(error);
		});
	const match = accessible.find((installation) => installation.installationId === opts.installationId);

	if (!match) {
		throw new HttpError(403, 'Your GitHub account cannot access that installation');
	}

	return opts.githubInstallationRepo.upsert({
		id: opts.idService.createGithubInstallationId(),
		projectId: opts.projectId,
		installationId: match.installationId,
		accountLogin: match.accountLogin,
		createdByUserId: opts.userId
	});
}
