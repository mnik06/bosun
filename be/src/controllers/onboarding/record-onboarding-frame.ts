import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { announceOnboarding, isActiveRun } from 'src/controllers/onboarding/shared/onboarding-runs';
import { notifyOnboardingStatus } from 'src/controllers/onboarding/shared/notify';
import { maybeStartVerify } from 'src/controllers/onboarding/shared/start-verify';
import { type OnboardingRun } from 'src/types/OnboardingSchema';
import { type AgentMsg } from 'src/types/protocol';

type OnboardingFrame = Extract<AgentMsg, { type: 'onboarding.done' | 'onboarding.error' }>;

const NO_CONFIG = 'the discovery session ended without publishing a valid config';

// A run's outcome is decided from what the backend recorded, not from what the
// session claimed: a discovery that says it is done but never published a config
// that validated has nothing for verify to prove.
function failureFor(run: OnboardingRun, frame: OnboardingFrame): string | null {
	if (frame.type === 'onboarding.error') {
		return frame.message;
	}

	return run.status === 'discovering' && run.config === null ? NO_CONFIG : null;
}

export async function recordOnboardingFrame(
	deps: OnboardingDeps,
	opts: { machineId: string; projectId: string; frame: OnboardingFrame }
): Promise<void> {
	const run = await deps.onboardingRunRepo.getForMachine({ id: opts.frame.runId, machineId: opts.machineId });

	if (!run || !isActiveRun(run)) {
		return;
	}

	const failure = failureFor(run, opts.frame);

	if (failure !== null) {
		const failed = await deps.onboardingRunRepo.update({
			id: run.id,
			status: 'failed',
			failureReason: failure,
			finishedAt: new Date()
		});
		const settled = failed ?? run;

		announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: settled });
		await notifyOnboardingStatus(deps, { projectId: opts.projectId, run: settled });

		return;
	}

	const next = await deps.onboardingRunRepo.update(
		run.status === 'discovering'
			? { id: run.id, status: 'needs_input', portBase: null }
			: { id: run.id, status: 'ready', finishedAt: new Date() }
	);
	const settled = next ?? run;

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: settled });
	await notifyOnboardingStatus(deps, { projectId: opts.projectId, run: settled });

	if (run.status === 'discovering') {
		await maybeStartVerify(deps, { machineId: opts.machineId });
	}
}
