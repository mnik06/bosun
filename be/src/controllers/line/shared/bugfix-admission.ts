import { type LineDeps } from 'src/controllers/line/line-deps';
import { admit, type Admission } from 'src/controllers/line/shared/memory-budget';
import { BUILD_SLOT_STATUSES, LANE_STATUSES } from 'src/controllers/line/shared/next-job';
import { type Machine } from 'src/types/MachineSchema';

// `fixing_bugs` sits outside `BUILD_SLOT_STATUSES` on purpose (see next-job.ts):
// the scheduler must never dispatch into, or pre-empt, a live bug-fixing
// session. That means admitting a *new* one has to count every other
// `fixing_bugs` build on the machine by hand — the scheduler's own
// `machineLoad()` never will. `verifyWaiting` is always false: a precise answer
// needs the full repository snapshot, which starting a session does not
// otherwise load, and treating a bug fix as never blocking a waiting verify is
// the documented approximation.
export async function admitBugfixSession(deps: LineDeps, opts: { machine: Machine }): Promise<Admission> {
	const [slots, lanes, fixingBugs, onboarding, quickFixes] = await Promise.all([
		deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: BUILD_SLOT_STATUSES }),
		deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: LANE_STATUSES }),
		deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: ['fixing_bugs'] }),
		deps.onboardingRunRepo.listActiveForMachine(opts.machine.id),
		deps.quickFixRepo.listActiveForMachine(opts.machine.id)
	]);

	return admit({
		memory: deps.machineMemory.get(opts.machine.id),
		jobClass: 'build',
		load: {
			build: slots.length + fixingBugs.length,
			lane: lanes.length,
			onboarding: onboarding.length,
			quickFix: quickFixes.length
		},
		verifyLanes: opts.machine.verifyLanes,
		verifyWaiting: false,
		buildCap: opts.machine.buildCap,
		ignoreMemoryBudget: opts.machine.ignoreMemoryBudget
	});
}
