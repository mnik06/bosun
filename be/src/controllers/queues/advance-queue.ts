import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Queue, type QueueItem } from 'src/types/QueueSchema';

// Each running queue is a `claude` process holding a worktree. Two is what a
// small VPS survives; the point is that the number exists at all, not the number.
export const MAX_RUNNING_PER_MACHINE = 2;

export interface AdvanceDeps {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	sliceRunRepo: SliceRunRepo;
	planRepo: PlanRepo;
	sliceRepo: SliceRepo;
	acRepo: AcRepo;
	socketRegistry: SocketRegistry;
}

// The statuses that mean "stop dispatching". `blocked` is in here because a
// question is outstanding: the run holding it is still alive, and starting a
// second slice beside it would have two sessions writing to one worktree.
const HALTED = new Set(['paused', 'blocked', 'stopped', 'failed', 'provisioning']);

async function setStatus(
	deps: AdvanceDeps,
	opts: { queue: Queue; status: Queue['status'] }
): Promise<void> {
	if (opts.queue.status === opts.status) {
		return;
	}

	const updated = await deps.queueRepo.update({ id: opts.queue.id, status: opts.status });

	if (updated) {
		announceQueue({ socketRegistry: deps.socketRegistry, queue: updated });
	}
}

async function dispatch(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem }
): Promise<boolean> {
	const run = await deps.sliceRunRepo.claimNext(opts.item.id);

	if (!run) {
		return false;
	}

	const plan = await deps.planRepo.getByIdForMachine({
		id: opts.item.planId,
		machineId: opts.queue.machineId
	});
	const slices = await deps.sliceRepo.listByPlan(opts.item.planId);
	const slice = slices.find((entry) => entry.id === run.sliceId);

	if (!plan || !slice) {
		await deps.sliceRunRepo.update({
			id: run.id,
			status: 'failed',
			failureReason: 'the plan or its tracer bullet is gone',
			finishedAt: new Date()
		});

		return false;
	}

	const acs = await deps.acRepo.listBySlice(slice.id);
	const done = await deps.sliceRunRepo.listForItem(opts.item.id);
	const byId = new Map(slices.map((entry) => [entry.id, entry]));
	const firstRun = done.reduce((lowest, entry) =>
		entry.ordinal < lowest.ordinal ? entry : lowest
	);

	deps.socketRegistry.sendToAgent({
		machineId: opts.queue.machineId,
		message: {
			type: 'exec.start',
			runId: run.id,
			worktreePath: opts.queue.worktreePath!,
			branch: opts.item.branch ?? `bosun/${opts.queue.slug}/${opts.item.planId}`,
			baseRef: opts.queue.baseRef ?? 'HEAD',
			// Only the first bullet cuts the branch. A later one resetting over it
			// would throw away every commit the ones before it made.
			freshBranch: run.id === firstRun.id,
			afk: opts.queue.afk,
			planTitle: plan.title ?? 'Untitled plan',
			planBodyMd: plan.bodyMd ?? '',
			slice: {
				ordinal: slice.ordinal,
				kind: slice.kind,
				title: slice.title,
				bodyMd: slice.bodyMd
			},
			acs: acs.map((ac) => ({ code: ac.code, text: ac.text })),
			doneSlices: done
				.filter((entry) => entry.status === 'done')
				.map((entry) => ({
					ordinal: entry.ordinal,
					title: byId.get(entry.sliceId)?.title ?? 'a bullet'
				}))
		}
	});

	return true;
}

// Asked for only when every bullet landed. A plan that failed keeps its branch
// and its partial commits for somebody to look at, but opening a pull request
// for work that did not finish would put it in front of reviewers as though it
// had.
async function requestPublish(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem }
): Promise<void> {
	const runs = await deps.sliceRunRepo.listForItem(opts.item.id);

	if (runs.length === 0 || runs.some((run) => run.status !== 'done')) {
		return;
	}

	// Nothing was committed, so there is no branch to push and nothing to review.
	if (runs.every((run) => run.commitSha === null)) {
		return;
	}

	const plan = await deps.planRepo.getByIdForMachine({
		id: opts.item.planId,
		machineId: opts.queue.machineId
	});

	if (!plan || opts.item.branch === null || opts.queue.baseRef === null) {
		return;
	}

	deps.socketRegistry.sendToAgent({
		machineId: opts.queue.machineId,
		message: {
			type: 'queue.publish',
			itemId: opts.item.id,
			worktreePath: opts.queue.worktreePath!,
			branch: opts.item.branch,
			baseRef: opts.queue.baseRef,
			title: plan.title ?? 'Untitled plan',
			body: plan.bodyMd ?? ''
		}
	});
}

// The only place work starts. Called when a queue is started, when a run
// settles, and when a plan is added to an idle queue — so a queue that has run
// out of work and one that has just been given some take the same path.
export async function advanceQueue(deps: AdvanceDeps, opts: { queueId: string }): Promise<void> {
	const queue = await deps.queueRepo.getById(opts.queueId);

	if (!queue || HALTED.has(queue.status) || queue.worktreePath === null) {
		return;
	}

	const items = await deps.queueItemRepo.listForQueue(queue.id);
	const running = items.find((item) => item.status === 'running');

	// A queue already counted as running keeps its slot: the cap gates starting a
	// new one, not continuing the one that holds the worktree already.
	if (queue.status !== 'running') {
		const busy = await deps.queueRepo.countRunningForMachine(queue.machineId);

		if (busy >= MAX_RUNNING_PER_MACHINE) {
			return;
		}
	}

	if (running && (await dispatch(deps, { queue, item: running }))) {
		await setStatus(deps, { queue, status: 'running' });

		return;
	}

	// A running item with no bullets left is a finished plan.
	if (running) {
		await deps.queueItemRepo.update({ id: running.id, status: 'done', finishedAt: new Date() });
		await requestPublish(deps, { queue, item: running });
	}

	const next = await deps.queueItemRepo.claimNext(queue.id);

	if (!next) {
		await setStatus(deps, { queue, status: 'idle' });

		return;
	}

	const branch = `bosun/${queue.slug}/${next.planId}`;

	await deps.queueItemRepo.update({ id: next.id, branch });

	if (await dispatch(deps, { queue, item: { ...next, branch } })) {
		await setStatus(deps, { queue, status: 'running' });

		return;
	}

	await deps.queueItemRepo.update({ id: next.id, status: 'done', finishedAt: new Date() });
	await advanceQueue(deps, opts);
}

// After a run settles, the machine may have freed the slot some other queue has
// been waiting on. Without this sweep a queue that was over the cap when its plan
// arrived would sit idle until somebody touched it by hand.
export async function advanceMachine(
	deps: AdvanceDeps,
	opts: { machineId: string }
): Promise<void> {
	for (const queue of await deps.queueRepo.listRunnableForMachine(opts.machineId)) {
		await advanceQueue(deps, { queueId: queue.id });
	}
}
