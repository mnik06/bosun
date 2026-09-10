import { blockerHolds } from 'src/controllers/queues/shared/blockers';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type QueueMessageRepo } from 'src/repos/queues/queue-message.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type RunActivityService } from 'src/services/runs/run-activity.service';
import { type QueueDetail, type QueueItem, type QueueWaitingFor } from 'src/types/QueueSchema';

// The same rule the scheduler skips an item by, rendered rather than acted on.
// Computed here rather than stored on the row because it is a fact about other
// queues, and a copy on this one is a copy that goes stale the moment one of
// them advances.
async function waitingByItem(opts: {
	planBlockerRepo: PlanBlockerRepo;
	planRepo: PlanRepo;
	queueItemRepo: QueueItemRepo;
	projectId: string;
	items: QueueItem[];
}): Promise<Map<string, QueueWaitingFor[]>> {
	const queued = opts.items.filter((item) => item.status === 'queued');
	const edges = await opts.planBlockerRepo.listEdges(queued.map((item) => item.planId));

	if (edges.length === 0) {
		return new Map();
	}

	const blockerIds = [...new Set(edges.map((edge) => edge.blockedByPlanId))];
	const [statuses, blockers] = await Promise.all([
		opts.queueItemRepo.statusesForPlans(blockerIds),
		opts.planRepo.listOwnedByIds({ projectId: opts.projectId, ids: blockerIds })
	]);
	const byId = new Map(blockers.map((plan) => [plan.id, plan]));

	return new Map(
		queued.map((item) => [
			item.id,
			edges
				.filter(
					(edge) =>
						edge.planId === item.planId &&
						blockerHolds(statuses.get(edge.blockedByPlanId))
				)
				.flatMap((edge) => {
					const plan = byId.get(edge.blockedByPlanId);

					return plan ? [{ number: plan.number, title: plan.title }] : [];
				})
		])
	);
}

// Assembled here rather than joined in one query because the browser wants the
// plan's title and each bullet's title beside its run, and those live in tables
// the queue does not own.
export async function getQueueDetail(opts: {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	sliceRunRepo: SliceRunRepo;
	queueMessageRepo: QueueMessageRepo;
	planRepo: PlanRepo;
	planBlockerRepo: PlanBlockerRepo;
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
	const waiting = await waitingByItem({
		planBlockerRepo: opts.planBlockerRepo,
		planRepo: opts.planRepo,
		queueItemRepo: opts.queueItemRepo,
		projectId: opts.projectId,
		items
	});

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
				waitingFor: waiting.get(item.id) ?? [],
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
