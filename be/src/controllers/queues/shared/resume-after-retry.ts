import { advanceQueue } from 'src/controllers/queues/advance-queue';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type Queue } from 'src/types/QueueSchema';

// A queue that failed on this plan has to come off that status itself, or it
// keeps the item queued and dispatches nothing. `paused` is left alone: the
// operator paused it deliberately, and retrying one plan is not a request to
// start the whole queue moving again.
export async function resumeAfterRetry(deps: AdvanceDeps, opts: { queue: Queue }): Promise<void> {
	if (opts.queue.status === 'failed') {
		const updated = await deps.queueRepo.update({
			id: opts.queue.id,
			status: 'idle',
			failureReason: null
		});

		if (updated) {
			announceQueue({ socketRegistry: deps.socketRegistry, queue: updated });
		}
	}

	await advanceQueue(deps, { queueId: opts.queue.id });
}
