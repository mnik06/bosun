import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { announceOnboarding, isActiveRun } from 'src/controllers/onboarding/shared/onboarding-runs';
import { maybeStartVerify } from 'src/controllers/onboarding/shared/start-verify';
import { type OnboardingRun } from 'src/types/OnboardingSchema';

const STRANDED = 'the connection to the machine dropped, or its agent restarted, while this run was in progress';

// A run moves from needs_input to verifying long after it was created, so its
// creation time alone would read a verify dispatched over this very connection as
// one the connection before it stranded.
function lastTouched(run: OnboardingRun): number {
	const lastStep = run.steps.at(-1);

	return Math.max(run.startedAt.getTime(), lastStep ? Date.parse(lastStep.at) : 0);
}

// The same agreement `stallMachineRuns` reaches for bullets: `hello` names the
// runs the agent still holds, and everything else in flight on this machine died
// with an earlier connection. An agent too old to send the list never held a run.
export async function stallMachineOnboarding(
	deps: OnboardingDeps,
	opts: { machineId: string; projectId: string; connectedAt: Date; heldRunIds?: string[] }
): Promise<void> {
	if (opts.heldRunIds === undefined) {
		return;
	}

	const held = new Set(opts.heldRunIds);

	for (const run of await deps.onboardingRunRepo.listActiveForMachine(opts.machineId)) {
		if (held.has(run.id) || lastTouched(run) > opts.connectedAt.getTime()) {
			continue;
		}

		const failed = await deps.onboardingRunRepo.update({
			id: run.id,
			status: 'failed',
			failureReason: STRANDED,
			finishedAt: new Date()
		});

		announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: failed ?? run });
	}

	for (const runId of held) {
		const run = await deps.onboardingRunRepo.getForMachine({ id: runId, machineId: opts.machineId });

		if (!run || !isActiveRun(run)) {
			deps.socketRegistry.sendToAgent({ machineId: opts.machineId, message: { type: 'onboarding.cancel', runId } });
		}
	}

	await maybeStartVerify(deps, { machineId: opts.machineId });
}
