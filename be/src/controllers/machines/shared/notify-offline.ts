import { dispatchNotification } from 'src/controllers/notifications/dispatch-notification';
import {
	machineConnectivityDeps,
	resolveConnectivityRecipients,
	type MachineConnectivityDeps
} from 'src/controllers/machines/shared/notify-connectivity';
import { countLabel } from 'src/utils/general';
import { ACTIVE_BUILD_STATUSES, type BuildStatus } from 'src/types/BuildSchema';
import { type Machine } from 'src/types/MachineSchema';

export type MachineOfflineDeps = MachineConnectivityDeps;

export const machineOfflineDeps = machineConnectivityDeps;

// A build queued (`scheduled`) or deliberately paused (`held`) was not actually
// interrupted by this machine dropping — only a build that was mid-session was.
const DISRUPTED_BUILD_STATUSES: BuildStatus[] = ACTIVE_BUILD_STATUSES.filter(
	(status) => status !== 'scheduled' && status !== 'held'
);

// A machine going offline is only worth telling anyone about when it was
// holding work nobody else can pick up, and everyone it affects hears about it
// exactly once — never once per build and once more per onboarding run.
export async function notifyMachineOffline(
	deps: MachineOfflineDeps,
	opts: { machine: Machine }
): Promise<void> {
	const { machine } = opts;
	const [unfinishedOnboarding, disruptedBuilds] = await Promise.all([
		deps.onboardingRunRepo.listUnfinishedForMachine(machine.id),
		deps.buildRepo.listForMachine({ machineId: machine.id, statuses: DISRUPTED_BUILD_STATUSES })
	]);

	if (unfinishedOnboarding.length === 0 && disruptedBuilds.length === 0) {
		return;
	}

	const recipientIds = await resolveConnectivityRecipients(deps, {
		machine,
		unfinishedOnboarding,
		affectedBuilds: disruptedBuilds
	});

	if (recipientIds.length === 0) {
		return;
	}

	await dispatchNotification(deps, {
		recipientIds,
		projectId: machine.projectId,
		kind: 'machine.offline',
		title: 'Machine went offline',
		body: `${machine.name} went offline — ${countLabel(disruptedBuilds.length, 'build')} and ${countLabel(unfinishedOnboarding.length, 'onboarding run')} interrupted`,
		url: `${deps.appUrl}/machines/${machine.id}`,
		planId: null
	});
}
