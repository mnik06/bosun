import { redispatchAttach, type RedispatchAttachDeps } from 'src/controllers/machines/shared/redispatch-attach';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { maybeStartVerify } from 'src/controllers/onboarding/shared/start-verify';
import { announceRepository, getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type Repository } from 'src/types/RepositorySchema';
import { orNotFound } from 'src/utils/general';

// Naming the provider's own default clears the override rather than storing it:
// an override equal to the provider's branch would silently outlive the provider
// changing it. Every clone is re-pointed, and a verify that was waiting on this
// choice starts.
export async function saveDefaultBranch(
	deps: OnboardingDeps & RedispatchAttachDeps,
	opts: { id: string; projectId: string; branch: string | null }
): Promise<Repository> {
	const current = await getOwnedRepository({ repositoryRepo: deps.repositoryRepo, id: opts.id, projectId: opts.projectId });
	const repository = await orNotFound(
		deps.repositoryRepo.saveDefaultBranchOverride({
			id: current.id,
			projectId: opts.projectId,
			defaultBranchOverride: opts.branch === current.providerDefaultBranch ? null : opts.branch
		}),
		'Repository not found'
	);

	announceRepository({ socketRegistry: deps.socketRegistry, repository });

	for (const machine of await deps.machineRepo.listByRepository(repository.id)) {
		if (machine.status === 'online' && deps.socketRegistry.getAgentSocket(machine.id)) {
			await redispatchAttach(deps, { machineId: machine.id, repository });
		}

		await maybeStartVerify(deps, { machineId: machine.id });
	}

	return repository;
}
