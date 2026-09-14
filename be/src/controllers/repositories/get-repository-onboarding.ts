import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type OnboardingRun } from 'src/types/OnboardingSchema';

export async function getRepositoryOnboarding(opts: {
	repositoryRepo: RepositoryRepo;
	onboardingRunRepo: OnboardingRunRepo;
	id: string;
	projectId: string;
}): Promise<{ discovery: OnboardingRun | null; runs: OnboardingRun[] }> {
	const repository = await getOwnedRepository(opts);
	const [discovery, runs] = await Promise.all([
		opts.onboardingRunRepo.latestDiscoveryForRepository(repository.id),
		opts.onboardingRunRepo.latestPerMachineForRepository(repository.id)
	]);

	return { discovery, runs };
}
