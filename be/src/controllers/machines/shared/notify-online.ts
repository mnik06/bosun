import { dispatchNotification } from 'src/controllers/notifications/dispatch-notification';
import {
	machineConnectivityDeps,
	resolveConnectivityRecipients,
	type MachineConnectivityDeps
} from 'src/controllers/machines/shared/notify-connectivity';
import { countLabel } from 'src/utils/general';
import { type Machine } from 'src/types/MachineSchema';

export type MachineOnlineDeps = MachineConnectivityDeps;

export const machineOnlineDeps = machineConnectivityDeps;

// A machine coming back online is only worth telling anyone about when the
// outage actually stranded something on it: a build this reconnect's
// reconciliation held for a system reason (not a person's own pause), or an
// onboarding run nothing finished. Same fan-out rule as the offline side —
// everyone it affects hears about it exactly once.
export async function notifyMachineOnline(
	deps: MachineOnlineDeps,
	opts: { machine: Machine }
): Promise<void> {
	const { machine } = opts;
	const [unfinishedOnboarding, heldBuilds] = await Promise.all([
		deps.onboardingRunRepo.listUnfinishedForMachine(machine.id),
		deps.buildRepo.listForMachine({ machineId: machine.id, statuses: ['held'] })
	]);
	// `held` with no failure reason is a person's own pause, unrelated to this
	// outage; only the reasons the reconciliation itself writes count.
	const strandedBuilds = heldBuilds.filter((build) => build.failureReason !== null);

	if (unfinishedOnboarding.length === 0 && strandedBuilds.length === 0) {
		return;
	}

	const recipientIds = await resolveConnectivityRecipients(deps, {
		machine,
		unfinishedOnboarding,
		affectedBuilds: strandedBuilds
	});

	if (recipientIds.length === 0) {
		return;
	}

	await dispatchNotification(deps, {
		recipientIds,
		projectId: machine.projectId,
		kind: 'machine.online',
		title: 'Machine back online',
		body: `${machine.name} is back online — ${countLabel(strandedBuilds.length, 'build')} and ${countLabel(unfinishedOnboarding.length, 'onboarding run')} waiting`,
		url: `${deps.appUrl}/machines/${machine.id}`,
		planId: null
	});
}
