import { HttpError } from 'src/api/errors/HttpError';
import { type AdvanceDeps } from 'src/controllers/queues/advance-queue';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type PlanAnswer } from 'src/types/PlanSchema';

// The answer travels to the session that asked, and the queue comes off
// `blocked` at the same time. The run itself was never stopped — it is sitting
// inside a tool call — so nothing needs restarting.
export async function answerRunQuestion(
	deps: AdvanceDeps,
	opts: { runId: string; questionId: string; answers: PlanAnswer[]; userId: string }
): Promise<void> {
	const run = await deps.sliceRunRepo.getById(opts.runId);
	const item = run ? await deps.queueItemRepo.getById(run.queueItemId) : null;
	const queue = item
		? await deps.queueRepo.getOwnedById({ id: item.queueId, userId: opts.userId })
		: null;

	if (!run || !queue) {
		throw new HttpError(404, 'Run not found');
	}

	// A stale panel — one left open in a tab while somebody else answered — must
	// not re-answer a question the session has moved past.
	if (run.questionId !== null && run.questionId !== opts.questionId) {
		throw new HttpError(409, 'That question has already been answered');
	}

	await deps.sliceRunRepo.setQuestion({ id: run.id, questionId: null, question: null });

	deps.socketRegistry.sendToAgent({
		machineId: queue.machineId,
		message: {
			type: 'exec.answer',
			runId: opts.runId,
			questionId: opts.questionId,
			answers: opts.answers
		}
	});

	if (queue.status === 'blocked') {
		const updated = await deps.queueRepo.update({ id: queue.id, status: 'running' });

		if (updated) {
			announceQueue({ socketRegistry: deps.socketRegistry, queue: updated });
		}
	}
}
