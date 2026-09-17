import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';

export async function listGithubPatConnections(opts: { githubPatConnectionRepo: GithubPatConnectionRepo; projectId: string }): Promise<GithubPatConnection[]> {
	return opts.githubPatConnectionRepo.listForProject(opts.projectId);
}
