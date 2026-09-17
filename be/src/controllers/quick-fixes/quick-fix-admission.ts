import { type LineDeps } from 'src/controllers/line/line-deps';
import { admit, type Admission } from 'src/controllers/line/shared/memory-budget';
import { BUILD_SLOT_STATUSES, LANE_STATUSES } from 'src/controllers/line/shared/next-job';
import { type Machine } from 'src/types/MachineSchema';

// A quick fix is admitted like a fix session: sized and counted as a build-class
// job so it cannot combine with a running plan build to overrun the machine, but
// never gated by the leader's build cap — that ceiling counts concurrent plans,
// and a quick fix is not one.
export async function quickFixAdmission(deps: LineDeps, opts: { machine: Machine }): Promise<Admission> {
	const [slots, lanes, onboardingRuns, quickFixes] = await Promise.all([
		deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: BUILD_SLOT_STATUSES }),
		deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: LANE_STATUSES }),
		deps.onboardingRunRepo.listActiveForMachine(opts.machine.id),
		deps.quickFixRepo.listActiveForMachine(opts.machine.id)
	]);

	return admit({
		memory: deps.machineMemory.get(opts.machine.id),
		jobClass: 'quickFix',
		load: { build: slots.length, lane: lanes.length, onboarding: onboardingRuns.length, quickFix: quickFixes.length },
		verifyLanes: opts.machine.verifyLanes,
		verifyWaiting: false,
		buildCap: null
	});
}
