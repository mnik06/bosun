import { HttpError } from 'src/api/errors/HttpError';
import {
	advanceMachine,
	advanceQueue,
	type AdvanceDeps
} from 'src/controllers/queues/advance-queue';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type Queue } from 'src/types/QueueSchema';

export type QueueAction = 'pause' | 'resume' | 'stop';

// Pausing never kills the bullet in flight. A `claude` process stopped mid-edit
// leaves a worktree half-written and a plan whose next bullet would build on top
// of it, so the pause lands between bullets rather than inside one.
async function pause(deps: AdvanceDeps, queue: Queue): Promise<Queue | null> {
	return deps.queueRepo.update({ id: queue.id, status: 'paused', failureReason: null });
}

// Stopping does kill it, which is the difference between the two. What the
// session had already written stays in the worktree, uncommitted, deliberately:
// discarding somebody's half-finished work because they pressed stop is not a
// trade to make for them.
async function stop(deps: AdvanceDeps, queue: Queue): Promise<Queue | null> {
	const items = await deps.queueItemRepo.listForQueue(queue.id);
	const running = items.find((item) => item.status === 'running');

	if (running) {
		for (const run of await deps.sliceRunRepo.listForItem(running.id)) {
			if (run.status === 'running') {
				deps.socketRegistry.sendToAgent({
					machineId: queue.machineId,
					message: { type: 'exec.cancel', runId: run.id }
				});
				await deps.sliceRunRepo.update({
					id: run.id,
					status: 'failed',
					failureReason: 'stopped by the operator',
					finishedAt: new Date()
				});
			}
		}

		await deps.queueItemRepo.update({
			id: running.id,
			status: 'cancelled',
			finishedAt: new Date()
		});
	}

	return deps.queueRepo.update({ id: queue.id, status: 'stopped' });
}

export async function controlQueue(
	deps: AdvanceDeps,
	opts: { id: string; userId: string; action: QueueAction }
): Promise<Queue> {
	const queue = await getOwnedQueue({
		queueRepo: deps.queueRepo,
		id: opts.id,
		userId: opts.userId
	});

	if (queue.status === 'provisioning') {
		throw new HttpError(409, 'That queue has no worktree yet');
	}

	if (opts.action === 'resume' && queue.status === 'blocked') {
		throw new HttpError(409, 'That queue is waiting on a question — answer it to carry on');
	}

	const apply = {
		pause: async () => pause(deps, queue),
		stop: async () => stop(deps, queue),
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

	// Pausing or stopping gives a slot back, so whatever else on this machine was
	// held at the cap gets its turn without anybody pressing anything.
	if (opts.action !== 'resume') {
		await advanceMachine(deps, { machineId: updated.machineId });
	}

	return updated;
}
