import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { announceOnboarding, getActiveRunForMachine } from 'src/controllers/onboarding/shared/onboarding-runs';

export async function recordOnboardingStep(
	deps: OnboardingDeps,
	opts: {
		runId: string;
		machineId: string;
		projectId: string;
		label: string;
		status: 'info' | 'running' | 'passed' | 'failed';
		detail: string | null;
	}
): Promise<void> {
	const run = await getActiveRunForMachine(deps, opts);
	const updated = await deps.onboardingRunRepo.appendStep({
		id: run.id,
		step: { label: opts.label, status: opts.status, detail: opts.detail, at: new Date().toISOString() }
	});

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: updated ?? run });
}
