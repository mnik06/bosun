import { HttpError } from 'src/api/errors/HttpError';
import { accessibleInstallations } from 'src/controllers/github/shared/accessible-installations';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';
import { type GithubInstallation } from 'src/types/RepositorySchema';

// For an App already installed on an account. GitHub answers the install page for
// such an account with the installation's settings, and those never redirect
// back, so the only callback there can be is an authorization with no installation
// id on it. Every installation that authorization reaches is recorded — each one
// proven by the leader's own GitHub account, which is the same bar a new install
// clears. Recording one grants nothing by itself: a repository still has to be
// added from the picker before any machine can reach it.
export async function importInstallations(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	idService: IdService;
	userId: string;
	projectId: string;
	code: string;
	state: string;
}): Promise<GithubInstallation[]> {
	const accessible = await accessibleInstallations(opts);

	if (accessible.length === 0) {
		throw new HttpError(404, 'Your GitHub account can reach no installation of this App — install it on the account first');
	}

	const recorded: GithubInstallation[] = [];

	for (const installation of accessible) {
		recorded.push(
			await opts.githubInstallationRepo.upsert({
				id: opts.idService.createGithubInstallationId(),
				projectId: opts.projectId,
				installationId: installation.installationId,
				accountLogin: installation.accountLogin,
				createdByUserId: opts.userId
			})
		);
	}

	return recorded;
}
