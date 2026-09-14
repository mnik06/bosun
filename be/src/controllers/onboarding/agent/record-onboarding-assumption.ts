import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { announceOnboarding, getActiveRunForMachine } from 'src/controllers/onboarding/shared/onboarding-runs';
import { type OnboardingAssumption } from 'src/types/OnboardingSchema';

export async function recordOnboardingAssumption(
	deps: OnboardingDeps,
	opts: { runId: string; machineId: string; projectId: string; assumption: OnboardingAssumption }
): Promise<void> {
	const run = await getActiveRunForMachine(deps, opts);
	const updated = await deps.onboardingRunRepo.appendAssumption({ id: run.id, assumption: opts.assumption });

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: updated ?? run });
}
