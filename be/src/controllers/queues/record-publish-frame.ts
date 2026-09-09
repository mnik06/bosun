import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { type AgentMsg } from 'src/types/protocol';

type PublishFrame = Extract<AgentMsg, { type: 'queue.published' | 'queue.publish.error' }>;

// A failed publish is recorded on the item but does not change its status: the
// bullets all landed and the commits are real, so calling the plan failed
// because a `gh` credential is missing would misreport what actually happened.
export async function recordPublishFrame(
	deps: AdvanceDeps,
	opts: { machineId: string; frame: PublishFrame }
): Promise<void> {
	const item = await deps.queueItemRepo.getById(opts.frame.itemId);
	const queue = item ? await deps.queueRepo.getById(item.queueId) : null;

	if (!item || !queue || queue.machineId !== opts.machineId) {
		return;
	}

	await deps.queueItemRepo.update(
		opts.frame.type === 'queue.published'
			? { id: item.id, prUrl: opts.frame.prUrl, failureReason: null }
			: { id: item.id, failureReason: opts.frame.message }
	);
}
