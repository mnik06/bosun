import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { admitOnboarding } from 'src/controllers/line/shared/memory-budget';
import { BUILD_SLOT_STATUSES, LANE_STATUSES } from 'src/controllers/line/shared/next-job';
import { notifyOnboardingStatus } from 'src/controllers/onboarding/shared/notify';
import { ACTIVE_ONBOARDING_STATUSES } from 'src/repos/onboarding/onboarding-run.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type OnboardingRun } from 'src/types/OnboardingSchema';

// Below the first build's range, which starts at 4100. One run is active on a
// machine at a time, so a fixed range cannot collide with another run, and no
// build is ever handed a port under 4100.
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

// Falls back to the pre-update row when the update races another writer to the
// same run: the caller still has to announce and notify something settled,
// even if this call did not win the write.
export async function failOnboardingRun(
	deps: OnboardingDeps,
	opts: { run: OnboardingRun; projectId: string; reason: string }
): Promise<OnboardingRun> {
	const failed = await deps.onboardingRunRepo.update({
		id: opts.run.id,
		status: 'failed',
		failureReason: opts.reason,
		finishedAt: new Date()
	});
	const settled = failed ?? opts.run;

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: settled });
	await notifyOnboardingStatus(deps, { projectId: opts.projectId, run: settled });

	return settled;
}

// A run installs, starts and drives the whole stack, so it is admitted as a drive
// would be — against every slot and lane the machine's builds hold and any other
// run — and held to the same limit.
export async function onboardingAdmission(
	deps: OnboardingDeps,
	opts: { machineId: string }
): Promise<{ admitted: true; limitBytes: number | null } | { admitted: false }> {
	const [slots, lanes, runs] = await Promise.all([
		deps.buildRepo.listForMachine({ machineId: opts.machineId, statuses: BUILD_SLOT_STATUSES }),
		deps.buildRepo.listForMachine({ machineId: opts.machineId, statuses: LANE_STATUSES }),
		deps.onboardingRunRepo.listActiveForMachine(opts.machineId)
	]);

	return admitOnboarding({
		memory: deps.machineMemory.get(opts.machineId),
		load: { build: slots.length, lane: lanes.length, onboarding: runs.length }
	});
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
