import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { admitBullet } from 'src/controllers/queues/shared/memory-budget';
import { ACTIVE_ONBOARDING_STATUSES } from 'src/repos/onboarding/onboarding-run.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type OnboardingRun } from 'src/types/OnboardingSchema';

// Below the first queue's range, which starts at 4100. One run is active on a
// machine at a time, so a fixed range cannot collide with another run, and no
// queue is ever handed a port under 4100.
export const ONBOARDING_PORT_BASE = 3900;

export function announceOnboarding(opts: {
	socketRegistry: SocketRegistry;
	projectId: string;
	run: OnboardingRun;
}): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.projectId,
		message: {
			type: 'onboarding.updated',
			machineId: opts.run.machineId,
			repositoryId: opts.run.repositoryId,
			runId: opts.run.id
		}
	});
}

export function isActiveRun(run: OnboardingRun): boolean {
	return ACTIVE_ONBOARDING_STATUSES.includes(run.status);
}

// A run installs, starts and drives the whole stack, so it is admitted as a
// verify bullet would be — against everything the machine's queues are running
// and any other run — and held to the same limit.
export async function onboardingAdmission(
	deps: OnboardingDeps,
	opts: { machineId: string }
): Promise<{ admitted: true; limitBytes: number | null } | { admitted: false }> {
	const memory = deps.machineMemory.get(opts.machineId);

	if (memory === null) {
		return { admitted: true, limitBytes: null };
	}

	const [bullets, runs] = await Promise.all([
		deps.sliceRunRepo.listRunningKindsForMachine(opts.machineId),
		deps.onboardingRunRepo.listActiveForMachine(opts.machineId)
	]);

	return admitBullet({ memory, kind: 'verify', inFlight: [...bullets, ...runs.map(() => 'verify' as const)] });
}

// Reached from the session's own tool calls. Only a run still in flight takes a
// report: a late write from a session that was already failed would otherwise
// reopen what the browser shows as settled.
export async function getActiveRunForMachine(
	deps: Pick<OnboardingDeps, 'onboardingRunRepo'>,
	opts: { runId: string; machineId: string }
): Promise<OnboardingRun> {
	const run = await deps.onboardingRunRepo.getForMachine({ id: opts.runId, machineId: opts.machineId });

	if (!run) {
		throw new HttpError(404, 'Onboarding run not found');
	}

	if (!isActiveRun(run)) {
		throw new HttpError(409, `this onboarding run is ${run.status} and takes no more reports`);
	}

	return run;
}
