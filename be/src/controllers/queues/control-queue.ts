import { HttpError } from 'src/api/errors/HttpError';
import {
	advanceMachine,
	advanceQueue
} from 'src/controllers/queues/advance-queue';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type Queue } from 'src/types/QueueSchema';

export type QueueAction = 'pause' | 'resume';

// Pausing stops the work, not just the dispatching: the session running the
// current bullet is killed and its run goes back to `pending`, so resuming runs
// that bullet again from the last commit rather than picking up half of an
// attempt nobody watched finish. The plan stays `running` and nothing is
// cancelled — that is the whole difference from killing the queue.
async function pause(deps: AdvanceDeps, queue: Queue): Promise<Queue | null> {
	const items = await deps.queueItemRepo.listForQueue(queue.id);
	const running = items.find((item) => item.status === 'running');

	for (const run of running ? await deps.sliceRunRepo.listForItem(running.id) : []) {
		if (run.status !== 'running') {
			continue;
		}

		deps.socketRegistry.sendToAgent({
			machineId: queue.machineId,
			message: { type: 'exec.cancel', runId: run.id }
		});
		await deps.sliceRunRepo.update({
			id: run.id,
			status: 'pending',
			failureReason: null,
			questionId: null,
			question: null,
			startedAt: null,
			finishedAt: null
		});
	}

	return deps.queueRepo.update({ id: queue.id, status: 'paused', failureReason: null });
}

export async function controlQueue(
	deps: AdvanceDeps,
	opts: { id: string; projectId: string; action: QueueAction }
): Promise<Queue> {
	const queue = await getOwnedQueue({
		queueRepo: deps.queueRepo,
		id: opts.id,
		projectId: opts.projectId
	});

	if (queue.status === 'provisioning') {
		throw new HttpError(409, 'That queue has no worktree yet');
	}

	if (opts.action === 'resume' && queue.status === 'blocked') {
		throw new HttpError(409, 'That queue is waiting on a question — answer it to carry on');
	}

	const apply = {
		pause: async () => pause(deps, queue),
		resume: async () =>
			deps.queueRepo.update({ id: queue.id, status: 'idle', failureReason: null })
	};
	const updated = await apply[opts.action]();

	if (!updated) {
		throw new HttpError(404, 'Queue not found');
	}

	announceQueue({ socketRegistry: deps.socketRegistry, queue: updated });

	if (opts.action === 'resume') {
		await advanceQueue(deps, { queueId: updated.id });
	}

	// Pausing gives a slot back, so whatever else on this machine was held at the
	// cap gets its turn without anybody pressing anything.
	if (opts.action !== 'resume') {
		await advanceMachine(deps, { machineId: updated.machineId });
	}

	return updated;
}
