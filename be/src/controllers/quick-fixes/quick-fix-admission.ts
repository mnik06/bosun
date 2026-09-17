import { type LineDeps } from 'src/controllers/line/line-deps';
import { admit, loadForMachine, type Admission } from 'src/controllers/line/shared/memory-budget';
import { type Machine } from 'src/types/MachineSchema';

// A quick fix is admitted like a fix session: sized and counted as a build-class
// job so it cannot combine with a running plan build to overrun the machine, but
// never gated by the leader's build cap — that ceiling counts concurrent plans,
// and a quick fix is not one.
export async function quickFixAdmission(deps: LineDeps, opts: { machine: Machine }): Promise<Admission> {
	// A build-class admission with a `waiting_verify` build on the machine has to
	// leave the lane's reservation free (see `admit`'s comment on `verifyWaiting`).
	// The line itself only counts a `waiting_verify` build once its dependencies are
	// verified, which needs the whole repository snapshot; a quick fix has no
	// snapshot to read, so it reserves for any `waiting_verify` build on the
	// machine — a superset of the line's own condition, never a narrower one.
	const [load, waitingVerify] = await Promise.all([
		loadForMachine(deps, opts.machine.id),
		deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: ['waiting_verify'] })
	]);

	return admit({
		memory: deps.machineMemory.get(opts.machine.id),
		jobClass: 'quickFix',
		load,
		verifyLanes: opts.machine.verifyLanes,
		verifyWaiting: waitingVerify.length > 0,
		buildCap: null,
		ignoreMemoryBudget: opts.machine.ignoreMemoryBudget
	});
}
