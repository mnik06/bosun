import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type AvailableRepository } from 'src/types/RepositorySchema';

// Exactly what the project's installations grant, asked of GitHub each time. A
// repository removed from an installation disappears here without bosun having to
// hear about it.
export async function listAvailableRepositories(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	projectId: string;
}): Promise<AvailableRepository[]> {
	const installations = await opts.githubInstallationRepo.listForProject(opts.projectId);

	try {
		const granted = await Promise.all(
			installations.map(async (installation) =>
				(await opts.githubApp.listRepositories(installation.installationId)).map((repo) => ({
					...repo,
					installationId: installation.id
				}))
			)
		);

		return granted.flat().sort((a, b) => a.fullName.localeCompare(b.fullName));
	} catch (error) {
		throw toGithubHttpError(error);
	}
}
