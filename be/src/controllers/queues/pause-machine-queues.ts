import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';

const OFFLINE = 'the machine went offline while this bullet was running';

// Not the ordinary failure path. A bullet that fails has told us what went
// wrong and left a worktree we can reason about; a machine that vanished
// mid-edit has left one in a state nobody knows, and starting the next plan on
// top of it is how a queue quietly builds on a half-written tree. So this stops
// rather than carries on, and a person decides what happens next.
export async function pauseMachineQueues(
	deps: AdvanceDeps,
	opts: { machineId: string }
): Promise<void> {
	for (const queue of await deps.queueRepo.listRunnableForMachine(opts.machineId)) {
		const items = await deps.queueItemRepo.listForQueue(queue.id);
		const running = items.find((item) => item.status === 'running');

		if (!running) {
			continue;
		}

		for (const run of await deps.sliceRunRepo.listForItem(running.id)) {
			if (run.status === 'running') {
				await deps.sliceRunRepo.update({
					id: run.id,
					status: 'failed',
					failureReason: OFFLINE,
					finishedAt: new Date()
				});
			}
		}

		await deps.queueItemRepo.update({
			id: running.id,
			status: 'failed',
			failureReason: OFFLINE,
			finishedAt: new Date()
		});

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
