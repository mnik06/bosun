import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { PROJECT_CONFIG_PATH } from 'src/types/ProjectConfigSchema';

export const ONBOARDING_BRANCH = 'bosun/onboarding';

function body(fullName: string): string {
	return [
		`Adds \`${PROJECT_CONFIG_PATH}\`, the config bosun onboarding wrote for ${fullName} and verified on a machine: its toolchain, setup steps, apps, checks and test accounts.`,
		'',
		'The file describes the code, so it travels with the branch that changes it. It holds no environment facts and no secrets — those stay on each machine.',
		'',
		'Opened from bosun at the request of a project leader.'
	].join('\n');
}

// Only on a person pressing the button: bosun writes nothing into somebody's
// repository unasked. And only after a verify passed, so what is proposed is a
// config that has been seen to install, start and sign in.
export async function openConfigPullRequest(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	repositoryRepo: RepositoryRepo;
	onboardingRunRepo: OnboardingRunRepo;
	id: string;
	projectId: string;
}): Promise<{ prUrl: string }> {
	const repository = await getOwnedRepository(opts);
	const [runs, installation] = await Promise.all([
		opts.onboardingRunRepo.latestPerMachineForRepository(repository.id),
		repository.installationId === null ? null : opts.githubInstallationRepo.getById(repository.installationId)
	]);

	if (!runs.some((run) => run.status === 'ready')) {
		throw new HttpError(409, 'No machine has verified this config yet');
	}

	if (repository.configDraft === null) {
		throw new HttpError(409, 'There is no draft to propose — the default branch already carries the file');
	}

	if (!installation) {
		throw new HttpError(409, 'The GitHub installation this repository came from is no longer connected');
	}

	try {
		const { url } = await opts.githubApp.proposeFile({
			installationId: installation.installationId,
			// `installation` resolving means this repository is a GitHub one, so its
			// `githubRepoId` is set too.
			githubRepoId: repository.githubRepoId!,
			branch: ONBOARDING_BRANCH,
			path: PROJECT_CONFIG_PATH,
			content: repository.configDraft,
			message: `Add ${PROJECT_CONFIG_PATH}`,
			title: `Add bosun project config (${PROJECT_CONFIG_PATH})`,
			body: body(repository.fullName)
		});

		return { prUrl: url };
	} catch (error) {
		throw toGithubHttpError(error);
	}
}
