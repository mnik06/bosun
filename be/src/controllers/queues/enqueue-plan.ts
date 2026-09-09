import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type QueueItem } from 'src/types/QueueSchema';

export async function enqueuePlan(opts: {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	sliceRunRepo: SliceRunRepo;
	planRepo: PlanRepo;
	sliceRepo: SliceRepo;
	idService: IdService;
	queueId: string;
	planId: string;
	projectId: string;
}): Promise<QueueItem> {
	const queue = await getOwnedQueue({
		queueRepo: opts.queueRepo,
		id: opts.queueId,
		projectId: opts.projectId
	});
	const plan = await opts.planRepo.getOwnedById({ id: opts.planId, projectId: opts.projectId });

	if (!plan) {
		throw new HttpError(404, 'Plan not found');
	}

	// A queue runs a plan in a worktree of the machine the plan was written
	// against. Running it anywhere else means executing against a repository
	// nobody planned for.
	if (plan.machineId !== queue.machineId) {
		throw new HttpError(400, 'That plan belongs to a different machine');
	}

	if (plan.status !== 'ready') {
		throw new HttpError(400, 'Only a plan that finished planning can be queued');
	}

	if (plan.confirmedAt === null) {
		throw new HttpError(400, 'That plan has not been confirmed yet');
	}

	const slices = await opts.sliceRepo.listByPlan(plan.id);

	if (slices.length === 0) {
		throw new HttpError(400, 'That plan has no tracer bullets to execute');
	}

	const item = await opts.queueItemRepo.create({
		id: opts.idService.createQueueItemId(),
		queueId: queue.id,
		planId: plan.id,
		ordinal: await opts.queueItemRepo.nextOrdinal(queue.id)
	});

	// The runs are created up front rather than one at a time, so the browser can
	// show what a queued plan is going to do before anything starts.
	await opts.sliceRunRepo.createMany(
		slices.map((slice) => ({
			id: opts.idService.createSliceRunId(),
			queueItemId: item.id,
			sliceId: slice.id,
			ordinal: slice.ordinal
		}))
	);

	return item;
}
