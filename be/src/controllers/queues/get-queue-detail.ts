import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type QueueMessageRepo } from 'src/repos/queues/queue-message.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type RunActivityService } from 'src/services/runs/run-activity.service';
import { type QueueDetail } from 'src/types/QueueSchema';

// Assembled here rather than joined in one query because the browser wants the
// plan's title and each bullet's title beside its run, and those live in tables
// the queue does not own.
export async function getQueueDetail(opts: {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	sliceRunRepo: SliceRunRepo;
	queueMessageRepo: QueueMessageRepo;
	planRepo: PlanRepo;
	sliceRepo: SliceRepo;
	runActivity: RunActivityService;
	id: string;
	projectId: string;
}): Promise<QueueDetail> {
	const queue = await getOwnedQueue({
		queueRepo: opts.queueRepo,
		id: opts.id,
		projectId: opts.projectId
	});
	const items = await opts.queueItemRepo.listForQueue(queue.id);

	const entries = await Promise.all(
		items.map(async (item) => {
			const plan = await opts.planRepo.getByIdForMachine({
				id: item.planId,
				machineId: queue.machineId
			});
			const slices = await opts.sliceRepo.listByPlan(item.planId);
			const byId = new Map(slices.map((slice) => [slice.id, slice]));
			const runs = await opts.sliceRunRepo.listForItem(item.id);

			return {
				...item,
				planTitle: plan?.title ?? null,
				runs: runs.map((run) => ({
					...run,
					sliceTitle: byId.get(run.sliceId)?.title ?? 'a bullet',
					activity: opts.runActivity.label(run.id),
					sliceKind: byId.get(run.sliceId)?.kind ?? 'build'
				}))
			};
		})
	);

	return { queue, items: entries, messages: await opts.queueMessageRepo.listForQueue(queue.id) };
}
