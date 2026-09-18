import { HttpError } from 'src/api/errors/HttpError';
import { toGitProviderHttpError } from 'src/controllers/line/shared/git-provider-error';
import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type GitProvider } from 'src/services/git/git-provider';
import { PROJECT_CONFIG_PATH } from 'src/types/ProjectConfigSchema';
import { type Repository } from 'src/types/RepositorySchema';

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
	repositoryRepo: RepositoryRepo;
	onboardingRunRepo: OnboardingRunRepo;
	gitProviderFor: (repository: Repository) => Promise<GitProvider>;
	id: string;
	projectId: string;
}): Promise<{ prUrl: string }> {
	const repository = await getOwnedRepository(opts);
	const runs = await opts.onboardingRunRepo.latestPerMachineForRepository(repository.id);

	if (!runs.some((run) => run.status === 'ready')) {
		throw new HttpError(409, 'No machine has verified this config yet');
	}

	if (repository.configDraft === null) {
		throw new HttpError(409, 'There is no draft to propose — the default branch already carries the file');
	}

	try {
		const provider = await opts.gitProviderFor(repository);
		const { url } = await provider.proposeFile({
			branch: ONBOARDING_BRANCH,
			path: PROJECT_CONFIG_PATH,
			content: repository.configDraft,
			message: `Add ${PROJECT_CONFIG_PATH}`,
			title: `Add bosun project config (${PROJECT_CONFIG_PATH})`,
			body: body(repository.fullName)
		});

		return { prUrl: url };
	} catch (error) {
		throw toGitProviderHttpError(error);
	}
}
