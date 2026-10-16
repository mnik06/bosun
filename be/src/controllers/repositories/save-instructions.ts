import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { isActiveRun } from 'src/controllers/onboarding/shared/onboarding-runs';
import { startOnboarding } from 'src/controllers/onboarding/start-onboarding';
import { announceRepository, getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { firstOnlineMachine } from 'src/controllers/repositories/shared/online-machine';
import { type Repository } from 'src/types/RepositorySchema';
import { orNotFound } from 'src/utils/general';

export type ConfigRegeneration = { started: true } | { started: false; reason: string };

async function regenerateConfig(deps: OnboardingDeps, repository: Repository): Promise<ConfigRegeneration> {
	if (repository.config !== null && repository.instructions === repository.configCompiledFrom) {
		return { started: false, reason: 'the config is already compiled from these instructions' };
	}

	const runs = await deps.onboardingRunRepo.latestPerMachineForRepository(repository.id);

	if (runs.some((run) => run.phase === 'config' && isActiveRun(run))) {
		return { started: false, reason: 'a config run is already in progress — generate again once it finishes' };
	}

	const machine = await firstOnlineMachine(deps, repository.id);

	if (!machine) {
		return { started: false, reason: 'no machine attached to this repository is online' };
	}

	try {
		await startOnboarding(deps, { machineId: machine.id, projectId: repository.projectId, phase: 'config' });

		return { started: true };
	} catch (error) {
		if (error instanceof HttpError) {
			return { started: false, reason: error.message };
		}

		throw error;
	}
}

// Saved whatever happens next: the instructions are the leader's to keep, and a
// config that could not be regenerated now shows as out of date until one is.
export async function saveInstructions(
	deps: OnboardingDeps,
	opts: { id: string; projectId: string; text: string }
): Promise<{ repository: Repository; regeneration: ConfigRegeneration }> {
	await getOwnedRepository({ repositoryRepo: deps.repositoryRepo, id: opts.id, projectId: opts.projectId });

	const repository = await orNotFound(
		deps.repositoryRepo.saveInstructions({ id: opts.id, projectId: opts.projectId, instructions: opts.text === '' ? null : opts.text }),
		'Repository not found'
	);

	announceRepository({ socketRegistry: deps.socketRegistry, repository });

	return { repository, regeneration: await regenerateConfig(deps, repository) };
}
