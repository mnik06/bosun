import { type AskDeps } from 'src/controllers/queues/ask-queue';
import { type AgentMsg } from 'src/types/protocol';

type AnswerFrame = Extract<AgentMsg, { type: `queue.answer.${string}` }>;

// The stream is not stored — only the answer it settles on. A chat about a queue
// is read back days later, and a transcript of half-written sentences is not
// what anybody is reading it for.
export async function recordAnswerFrame(
	deps: AskDeps,
	opts: { machineId: string; projectId: string; frame: AnswerFrame }
): Promise<void> {
	const queue = await deps.queueRepo.getById(opts.frame.queueId);

	if (!queue || queue.machineId !== opts.machineId) {
		return;
	}

	if (opts.frame.type === 'queue.answer.text') {
		deps.socketRegistry.broadcastToUi({
			projectId: opts.projectId,
			message: {
				type: 'queue.answer',
				queueId: queue.id,
				askId: opts.frame.askId,
				delta: opts.frame.delta
			}
		});

		return;
	}

	const content =
		opts.frame.type === 'queue.answer.done'
			? opts.frame.content
			: `I could not answer that: ${opts.frame.message}`;

	const message = await deps.queueMessageRepo.create({
		id: deps.idService.createQueueMessageId(),
		queueId: queue.id,
		role: 'assistant',
		content
	});

	deps.socketRegistry.broadcastToUi({
		projectId: opts.projectId,
		message: { type: 'queue.message', message }
	});
}
