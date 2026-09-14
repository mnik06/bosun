import { type GithubAppService } from 'src/services/github/github-app.service';

export function getInstallUrl(opts: {
	githubApp: GithubAppService;
	userId: string;
	projectId: string;
}): { url: string; authorizeUrl: string } {
	const state = opts.githubApp.signState({ userId: opts.userId, projectId: opts.projectId });

	return { url: opts.githubApp.installUrl(state), authorizeUrl: opts.githubApp.authorizeUrl(state) };
}
