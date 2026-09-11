import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { reclaimRun, runningItem } from 'src/controllers/queues/shared/stranded';

const OFFLINE = 'the machine went offline while this bullet was running';

// Not the ordinary failure path. A bullet that fails has told us what went
// wrong and left a worktree we can reason about; a machine that vanished
// mid-edit has left one in a state nobody knows, and starting the next plan on
// top of it is how a queue quietly builds on a half-written tree. So this stops
// rather than carries on, and a person decides what happens next.
//
// Called after a grace window rather than on the close itself. A bullet is not
// tied to the socket it was dispatched over — the agent keeps building through a
// proxy timeout or a backend deploy — so settling on the close settled sessions
// that were still alive, and the `hello` that followed then read its own run as
// dead and sent `exec.cancel` to the `claude` that was mid-edit. `hello` cancels
// the window instead, and `stallMachineRuns` settles what actually died against
// the runs the agent says it still holds. This is for the machine that never
// came back.
export async function pauseMachineQueues(
	deps: AdvanceDeps,
	opts: { machineId: string }
): Promise<void> {
	// The window outlives the outage whenever the agent beat it back: a machine
	// that is connected owns its runs again, and settling one here would strand a
	// session nobody can report on.
	if (deps.socketRegistry.getAgentSocket(opts.machineId)) {
		return;
	}

	// `blocked` queues too, which is why this is not `listRunnableForMachine`: a
	// question outstanding means a run is still holding the worktree, and the
	// session that asked it went down with the machine.
	for (const queue of await deps.queueRepo.listInFlightForMachine(opts.machineId)) {
		const running = await runningItem(deps, { queueId: queue.id });

		if (!running) {
			continue;
		}

		for (const run of await deps.sliceRunRepo.listForItem(running.id)) {
			if (run.status === 'running') {
				await reclaimRun(deps, { runId: run.id });
			}
		}

		const paused = await deps.queueRepo.update({
			id: queue.id,
			status: 'paused',
			failureReason: OFFLINE
		});

		if (paused) {
			announceQueue({ socketRegistry: deps.socketRegistry, queue: paused });
		}
	}
}
