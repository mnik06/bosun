import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { announceOnboarding, getActiveRunForMachine } from 'src/controllers/onboarding/shared/onboarding-runs';
import { normalizedRequirement } from 'src/controllers/onboarding/shared/requirements';
import { type OnboardingRequirement } from 'src/types/OnboardingSchema';

export async function recordOnboardingRequirement(
	deps: OnboardingDeps,
	opts: { runId: string; machineId: string; projectId: string; requirement: OnboardingRequirement }
): Promise<void> {
	const run = await getActiveRunForMachine(deps, opts);

	if (run.status !== 'discovering') {
		throw new HttpError(409, 'only a discovery reports requirements');
	}

	const updated = await deps.onboardingRunRepo.upsertRequirement({
		id: run.id,
		requirement: normalizedRequirement(opts.requirement)
	});

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: updated ?? run });
}
