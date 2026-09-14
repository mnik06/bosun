import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubInstallation } from 'src/types/RepositorySchema';

export async function listInstallations(opts: {
	githubInstallationRepo: GithubInstallationRepo;
	projectId: string;
}): Promise<GithubInstallation[]> {
	return opts.githubInstallationRepo.listForProject(opts.projectId);
}
