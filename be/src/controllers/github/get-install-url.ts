import { type GithubAppService } from 'src/services/github/github-app.service';

export function getInstallUrl(opts: {
	githubApp: GithubAppService;
	userId: string;
	projectId: string;
}): { url: string } {
	return { url: opts.githubApp.installUrl(opts.githubApp.signState({ userId: opts.userId, projectId: opts.projectId })) };
}
