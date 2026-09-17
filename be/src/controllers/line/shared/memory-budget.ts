import { BUILD_SLOT_STATUSES, LANE_STATUSES } from 'src/controllers/line/shared/next-job';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type QuickFixRepo } from 'src/repos/quick-fixes/quick-fix.repo';
import { type MachineMemory } from 'src/types/machine-memory';

const GIB = 1024 ** 3;

// Kept back from every session: the kernel, the agent, a RAM-backed `/tmp`, and
// enough page cache that the box is not paging its own binaries. The agent falls
// back to the same number when a backend sends it no limit.
const RESERVED_BYTES = 1.5 * GIB;

// Measured, not guessed. On an 8 GB box a whole-package lint peaked at 2 GB, a
// typecheck at 1.1 GB and a dev server at 0.8 GB, and a verify session running
// them beside its own stack reached 6.3 GB before the kernel killed it. A build
// session runs the same loop but never starts a stack. A drive (stack and browser,
// no loop) starts at the verify figure and a fix (loop, no stack) at the build one.
// A quick fix is a fix session with no plan behind it, so it takes the build figure
// too.
export const BUILD_BYTES = 3 * GIB;
export const LANE_BYTES = 6 * GIB;

// A limit below this is a session the kernel kills on its first real allocation,
// which reads as a bullet that cannot start rather than a machine that is too small.
const FLOOR_BYTES = GIB;

export type JobClass = 'build' | 'lane' | 'quickFix';

// What a machine is holding right now. A build slot is held by a plan from its
// first build bullet to its last, between its bullets too, and by a running fix or
// integration; a lane by a running drive or re-check. Onboarding runs the whole
// stack, so it is held as a lane is. A quick fix holds no plan at all, but is sized
// and counted like a build slot so it cannot combine with one to overrun the machine.
export interface MachineLoad {
	build: number;
	lane: number;
	onboarding: number;
	quickFix: number;
}

export interface LoadRepos {
	buildRepo: Pick<BuildRepo, 'listForMachine'>;
	onboardingRunRepo: Pick<OnboardingRunRepo, 'listActiveForMachine'>;
	quickFixRepo: Pick<QuickFixRepo, 'listActiveForMachine'>;
}

// What a quick fix and an onboarding run both admit against: every slot, lane,
// onboarding run and quick fix a machine holds right now. A plan build reuses its
// own already-fetched build/lane counts instead (see `schedule.ts`), so this is not
// the only place a `MachineLoad` is assembled — just the one two unrelated callers
// were assembling identically.
export async function loadForMachine(deps: LoadRepos, machineId: string): Promise<MachineLoad> {
	const [slots, lanes, onboardingRuns, quickFixes] = await Promise.all([
		deps.buildRepo.listForMachine({ machineId, statuses: BUILD_SLOT_STATUSES }),
		deps.buildRepo.listForMachine({ machineId, statuses: LANE_STATUSES }),
		deps.onboardingRunRepo.listActiveForMachine(machineId),
		deps.quickFixRepo.listActiveForMachine(machineId)
	]);

	return { build: slots.length, lane: lanes.length, onboarding: onboardingRuns.length, quickFix: quickFixes.length };
}

// Swap counts for half: it turns a spike into a slowdown instead of a kill, but a
// session that lives in it crawls, so it is not budgeted as though it were RAM.
export function usableBytes(memory: MachineMemory): number {
	return Math.max(0, memory.totalBytes + Math.floor(memory.swapTotalBytes / 2) - RESERVED_BYTES);
}

// Never more than the machine can give. A box smaller than a drive still runs one
// — alone, under everything it has — rather than never running it.
export function jobBytes(opts: { jobClass: JobClass; usable: number }): number {
	const cap = opts.jobClass === 'lane' ? LANE_BYTES : BUILD_BYTES;

	return Math.max(FLOOR_BYTES, Math.min(cap, opts.usable));
}

export function heldBytes(opts: { load: MachineLoad; usable: number }): number {
	return (
		(opts.load.build + opts.load.quickFix) * jobBytes({ jobClass: 'build', usable: opts.usable }) +
		(opts.load.lane + opts.load.onboarding) * jobBytes({ jobClass: 'lane', usable: opts.usable })
	);
}

type Admission = { admitted: true; limitBytes: number | null } | { admitted: false };

function idle(load: MachineLoad): boolean {
	return load.build + load.lane + load.onboarding + load.quickFix === 0;
}

// The limit handed to a session is the number it was admitted with, so the limits
// of everything running never add up to more than the machine has — which keeps
// the kernel's own killer, which picks from the whole box, from being what acts.
//
// The lane's memory is lent to build bullets while nothing waits to verify. The
// moment a plan does, a build admission must leave the lane's unheld reservation
// free: no new bullet starts in it, and nothing running is stopped, so the plan
// waiting to verify waits at most one bullet.
export function admit(opts: {
	memory: MachineMemory | null;
	jobClass: JobClass;
	load: MachineLoad;
	verifyLanes: number;
	verifyWaiting: boolean;
	buildCap: number | null;
	ignoreMemoryBudget: boolean;
}): Admission {
	const { load } = opts;

	if (opts.jobClass === 'lane' && load.lane >= opts.verifyLanes) {
		return { admitted: false };
	}

	if (opts.jobClass === 'build' && opts.buildCap !== null && load.build >= opts.buildCap) {
		return { admitted: false };
	}

	if (opts.memory === null) {
		return { admitted: true, limitBytes: null };
	}

	const usable = usableBytes(opts.memory);
	const limitBytes = jobBytes({ jobClass: opts.jobClass, usable });

	// A leader's counts, taken as given: nothing is held back for the lane and nothing
	// waits for memory. Builds still need a cap to go past it — with none, memory is
	// the only thing that says how many.
	if (opts.ignoreMemoryBudget && (opts.jobClass === 'lane' || opts.buildCap !== null)) {
		return { admitted: true, limitBytes };
	}

	// A machine running nothing always takes the job: waiting for memory that
	// nothing is holding would be a line stuck for good.
	if (idle(load)) {
		return { admitted: true, limitBytes };
	}

	const reserve =
		opts.jobClass === 'build' && opts.verifyWaiting
			? Math.max(0, opts.verifyLanes - load.lane) * jobBytes({ jobClass: 'lane', usable })
			: 0;

	return heldBytes({ load, usable }) + limitBytes + reserve <= usable
		? { admitted: true, limitBytes }
		: { admitted: false };
}

// Whether a plan between its bullets is what keeps a waiting verify out. Only then
// does it give its slot up: on a machine too small for a drive beside a build, the
// verify would otherwise wait for every bullet the plan has left, not the one running.
export function holderBlocksLane(opts: {
	memory: MachineMemory | null;
	load: MachineLoad;
	verifyLanes: number;
	buildCap: number | null;
	ignoreMemoryBudget: boolean;
}): boolean {
	if (opts.load.build === 0) {
		return false;
	}

	const lane = { ...opts, jobClass: 'lane' as const, verifyWaiting: true };

	return !admit(lane).admitted && admit({ ...lane, load: { ...opts.load, build: opts.load.build - 1 } }).admitted;
}

// Onboarding installs and starts the whole stack. It is admitted against
// everything the line holds, and takes no lane — a lane is for plans.
export function admitOnboarding(opts: { memory: MachineMemory | null; load: MachineLoad }): Admission {
	if (opts.memory === null) {
		return { admitted: true, limitBytes: null };
	}

	const usable = usableBytes(opts.memory);
	const limitBytes = jobBytes({ jobClass: 'lane', usable });

	if (idle(opts.load)) {
		return { admitted: true, limitBytes };
	}

	return heldBytes({ load: opts.load, usable }) + limitBytes <= usable
		? { admitted: true, limitBytes }
		: { admitted: false };
}
