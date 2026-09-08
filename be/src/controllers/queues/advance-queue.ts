import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Ac, type Plan, type PlanDecision } from 'src/types/PlanSchema';
import { toQueueSlug, type Queue, type QueueItem } from 'src/types/QueueSchema';
import { DEFAULT_PROJECT_PROFILE } from 'src/types/ProjectProfileSchema';

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
	planBlockerRepo: PlanBlockerRepo;
	planDecisionRepo: PlanDecisionRepo;
	machineRepo: MachineRepo;
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

	// Named from the plan rather than the item, so a branch and its pull request
	// say which plan they are without anybody looking it up. Persisted on first
	// use: a retitled plan must not change the branch its commits are already on.
	const branch = opts.item.branch ?? planBranch({ queueSlug: opts.queue.slug, plan });

	if (opts.item.branch === null) {
		await deps.queueItemRepo.update({ id: opts.item.id, branch });
	}

	const acs = await deps.acRepo.listBySlice(slice.id);
	const planAcs = await deps.acRepo.listByPlan(opts.item.planId);
	const decisions = await deps.planDecisionRepo.listByPlan(opts.item.planId);
	const machine = await deps.machineRepo.getById(opts.queue.machineId);
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
			branch,
			baseRef: opts.queue.baseRef ?? 'HEAD',
			// Only the first bullet cuts the branch. A later one resetting over it
			// would throw away every commit the ones before it made.
			freshBranch: run.id === firstRun.id,
			afk: opts.queue.afk,
			planId: plan.id,
			sliceId: slice.id,
			planNumber: plan.number,
			planTitle: plan.title ?? 'Untitled plan',
			planBodyMd: plan.bodyMd ?? '',
			profile: machine?.projectProfile ?? DEFAULT_PROJECT_PROFILE,
			portBase: opts.queue.portBase,
			slice: {
				ordinal: slice.ordinal,
				kind: slice.kind,
				title: slice.title,
				bodyMd: slice.bodyMd
			},
			acs: acs.map((ac) => ({ code: ac.code, text: ac.text })),
			planAcs: planAcs.map((ac) => ({ code: ac.code, text: ac.text })),
			decisions: decisions.map((entry) => ({ fork: entry.fork, chose: entry.chose })),
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

// A plan waits for its blockers to have finished *in this queue*. A blocker that
// was never queued here cannot be waited for at all — nothing will ever complete
// it in this worktree — so it does not hold the plan back. That is deliberate: a
// dependency nobody queued is a planning mistake, and stalling a queue forever
// over it is worse than running in push order and letting the result show it.
async function blockedPlanIds(deps: AdvanceDeps, items: QueueItem[]): Promise<string[]> {
	const queued = items.filter((item) => item.status === 'queued');

	if (queued.length === 0) {
		return [];
	}

	const edges = await deps.planBlockerRepo.listEdges(queued.map((item) => item.planId));

	if (edges.length === 0) {
		return [];
	}

	const finished = new Set(
		items.filter((item) => item.status === 'done').map((item) => item.planId)
	);
	const present = new Set(items.map((item) => item.planId));

	return queued
		.filter((item) =>
			edges.some(
				(edge) =>
					edge.planId === item.planId &&
					present.has(edge.blockedByPlanId) &&
					!finished.has(edge.blockedByPlanId)
			)
		)
		.map((item) => item.planId);
}

// Assembled from what bosun already holds rather than from anything the session
// writes at the end. A decision recorded while executing is on the plan whether
// or not the last bullet remembered to mention it, and the reviewer reads this
// before the diff.
function pullRequestBody(opts: {
	plan: Plan;
	acs: Ac[];
	decisions: PlanDecision[];
}): string {
	const criteria =
		opts.acs.length === 0
			? '_None recorded._'
			: opts.acs.map((ac) => `- **${ac.code}** ${ac.text}`).join('\n');
	const decisions =
		opts.decisions.length === 0
			? '_None recorded._'
			: opts.decisions
				.map((entry) =>
					[
						`### ${entry.fork}`,
						entry.options === null ? '' : `- **Options:** ${entry.options}`,
						`- **Chose:** ${entry.chose}`,
						entry.blastRadius === null ? '' : `- **Blast radius:** ${entry.blastRadius}`,
						entry.reversing === null ? '' : `- **Reversing it:** ${entry.reversing}`
					]
						.filter(Boolean)
						.join('\n')
				)
				.join('\n\n');

	return [
		opts.plan.bodyMd ?? '',
		'## Acceptance criteria',
		criteria,
		'## Decisions taken',
		decisions,
		`_Planned and executed by bosun as plan #${opts.plan.number}._`
	].join('\n\n');
}

// `bosun/plan/...` rather than `bosun/<queue>/...`: the worktree already holds a
// branch named for the queue, and git cannot have a ref that is both a leaf and
// a directory. Two queues can run the same plan, so the queue slug stays in the
// name to keep those apart.
function planBranch(opts: { queueSlug: string; plan: Plan }): string {
	const title = toQueueSlug(opts.plan.title ?? '');

	return `bosun/plan/${opts.queueSlug}/${opts.plan.number}${title === '' ? '' : `-${title}`}`;
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
			title: `#${plan.number} ${plan.title ?? 'Untitled plan'}`,
			body: pullRequestBody({
				plan,
				acs: await deps.acRepo.listByPlan(plan.id),
				decisions: await deps.planDecisionRepo.listByPlan(plan.id)
			})
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

	// A running item with no bullets left is a finished plan — but dispatch
	// declining is not proof of that. A queue resumed while its bullet is still in
	// flight declines the claim too, because one worktree holds one session, and
	// closing the item there strands every bullet after it: the plan reads as done,
	// its remaining bullets stay pending forever, and the queue falls to idle and
	// never picks them up.
	let settled = items;

	if (running) {
		const runs = await deps.sliceRunRepo.listForItem(running.id);

		if (runs.some((entry) => entry.status === 'running' || entry.status === 'pending')) {
			await setStatus(deps, { queue, status: 'running' });

			return;
		}

		await deps.queueItemRepo.update({ id: running.id, status: 'done', finishedAt: new Date() });
		await requestPublish(deps, { queue, item: running });

		// The plan that just finished has to count as finished when the next one's
		// blockers are weighed, or a plan waiting on it is skipped for a blocker
		// that is no longer outstanding and the queue goes idle holding it.
		settled = items.map((entry) =>
			entry.id === running.id ? { ...entry, status: 'done' as const } : entry
		);
	}

	const next = await deps.queueItemRepo.claimNext(queue.id, await blockedPlanIds(deps, settled));

	if (!next) {
		await setStatus(deps, { queue, status: 'idle' });

		return;
	}

	if (await dispatch(deps, { queue, item: next })) {
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
