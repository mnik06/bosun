import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { planStateOf } from 'src/controllers/plans/shared/plan-state';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type RunActivityService } from 'src/services/runs/run-activity.service';
import { type PlanState } from 'src/types/PlanStateSchema';
import { type QueueItem, type SliceRunDetail } from 'src/types/QueueSchema';
import {
	type Ac,
	type Plan,
	type PlanDecision,
	type PlanMessage,
	type Slice
} from 'src/types/PlanSchema';

export interface PlanExecution {
	queueId: string;
	queueName: string;
	item: QueueItem;
	runs: SliceRunDetail[];
}

// The runs are read here rather than left to the queue screen because a plan is
// the thing a person follows: having to work out which queue picked it up before
// you can see whether it built is a lookup the product should be doing.
async function executionOf(
	opts: {
		queueRepo: QueueRepo;
		queueItemRepo: QueueItemRepo;
		sliceRunRepo: SliceRunRepo;
		runActivity: RunActivityService;
	},
	plan: { id: string; slices: Slice[] }
): Promise<PlanExecution | null> {
	const item = (await opts.queueItemRepo.latestForPlans([plan.id])).get(plan.id);

	if (!item) {
		return null;
	}

	const [queue, runs] = await Promise.all([
		opts.queueRepo.getById(item.queueId),
		opts.sliceRunRepo.listForItem(item.id)
	]);

	if (!queue) {
		return null;
	}

	const byId = new Map(plan.slices.map((slice) => [slice.id, slice]));

	return {
		queueId: queue.id,
		queueName: queue.name,
		item,
		runs: runs.map((run) => ({
			...run,
			sliceTitle: byId.get(run.sliceId)?.title ?? 'a bullet',
			activity: opts.runActivity.label(run.id),
			sliceKind: byId.get(run.sliceId)?.kind ?? 'build'
		}))
	};
}

export async function getPlanDetail(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	planBlockerRepo: PlanBlockerRepo;
	planDecisionRepo: PlanDecisionRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	sliceRunRepo: SliceRunRepo;
	runActivity: RunActivityService;
	id: string;
	projectId: string;
}): Promise<{
	plan: Plan & { state: PlanState };
	execution: PlanExecution | null;
	messages: PlanMessage[];
	acs: Ac[];
	slices: Slice[];
	blockedBy: Plan[];
	decisions: PlanDecision[];
}> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.id,
		projectId: opts.projectId
	});
	const [messages, acs, slices, blockedBy, decisions] = await Promise.all([
		opts.planMessageRepo.listByPlan(plan.id),
		opts.acRepo.listByPlan(plan.id),
		opts.sliceRepo.listByPlan(plan.id),
		opts.planBlockerRepo.listBlockers(plan.id),
		opts.planDecisionRepo.listByPlan(plan.id)
	]);

	const execution = await executionOf(opts, { id: plan.id, slices });

	return {
		plan: { ...plan, state: planStateOf({ plan, item: execution?.item ?? null }) },
		execution,
		messages,
		acs,
		slices,
		blockedBy,
		decisions
	};
}
