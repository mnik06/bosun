import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { configDraftFor } from 'src/controllers/repositories/shared/config-draft';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { blockerHolds } from 'src/controllers/queues/shared/blockers';
import { admitBullet } from 'src/controllers/queues/shared/memory-budget';
import { publishablePlan, pullRequestText } from 'src/controllers/queues/shared/pull-request';
import { reclaimRun } from 'src/controllers/queues/shared/stranded';
import { type Plan } from 'src/types/PlanSchema';
import { toQueueSlug, type Queue, type QueueItem } from 'src/types/QueueSchema';
import { DEFAULT_PROJECT_PROFILE } from 'src/types/ProjectProfileSchema';

// Each running queue is a `claude` process holding a worktree. Two is what a
// small VPS survives; the point is that the number exists at all, not the number.
export const MAX_RUNNING_PER_MACHINE = 2;

// The statuses that mean "stop dispatching". `blocked` is in here because a
// question is outstanding: the run holding it is still alive, and starting a
// second slice beside it would have two sessions writing to one worktree.
const HALTED = new Set(['paused', 'blocked', 'failed', 'provisioning']);

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

// A dispatch that does not start work is not one thing. `empty` means there was
// no bullet to take, which for a freshly claimed plan is what "finished" looks
// like; `unreachable` means a bullet *was* claimed and the command was not
// delivered. Collapsing the two into `false` is what let an undelivered
// `exec.start` read as a plan that had run out of work. `waiting` means a bullet
// is ready but does not fit beside what the machine is running: nothing was
// claimed, and the machine sweep after the next run settles asks again.
type DispatchOutcome = 'sent' | 'empty' | 'unreachable' | 'waiting';

// The socket was gone by the time the bullet was due to start. The claim is
// undone rather than failed: nothing ran on the machine, so there is no
// half-written worktree to reason about and resuming should run this bullet
// again rather than skip to the next one. The queue stops so a person decides —
// the same call `pauseMachineQueues` makes when a machine drops mid-bullet.
const UNREACHABLE = 'the machine was not reachable when this bullet was due to start';

async function stall(deps: AdvanceDeps, opts: { queue: Queue; runId: string }): Promise<void> {
	await reclaimRun(deps, { runId: opts.runId });

	const paused = await deps.queueRepo.update({
		id: opts.queue.id,
		status: 'paused',
		failureReason: UNREACHABLE
	});

	if (paused) {
		announceQueue({ socketRegistry: deps.socketRegistry, queue: paused });
	}
}

// Decided before the claim, never after: a claimed run that then waited would
// read as in flight, and `claimNext` would refuse every later bullet of the item
// behind a session that does not exist. `null` — a machine that has not reported
// its memory, or an item whose bullet is already running and whose claim will be
// refused anyway — dispatches exactly as it did before budgets existed.
async function memoryLimitFor(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem }
): Promise<number | null | 'waiting'> {
	const memory = deps.machineMemory.get(opts.queue.machineId);

	if (memory === null) {
		return null;
	}

	// An onboarding run installs and starts the whole stack, so it holds what a
	// verify bullet holds.
	const [runs, slices, bullets, onboarding] = await Promise.all([
		deps.sliceRunRepo.listForItem(opts.item.id),
		deps.sliceRepo.listByPlan(opts.item.planId),
		deps.sliceRunRepo.listRunningKindsForMachine(opts.queue.machineId),
		deps.onboardingRunRepo.listActiveForMachine(opts.queue.machineId)
	]);
	const inFlight = [...bullets, ...onboarding.map(() => 'verify' as const)];
	const next = runs.find((entry) => entry.status === 'pending');
	const kind = slices.find((entry) => entry.id === next?.sliceId)?.kind;

	if (kind === undefined || runs.some((entry) => entry.status === 'running')) {
		return null;
	}

	const admission = admitBullet({ memory, kind, inFlight });

	return admission.admitted ? admission.limitBytes : 'waiting';
}

async function startBullet(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem; memoryMaxBytes: number | null }
): Promise<DispatchOutcome> {
	const run = await deps.sliceRunRepo.claimNext(opts.item.id);

	if (!run) {
		return 'empty';
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

		return 'empty';
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

	const delivered = deps.socketRegistry.sendToAgent({
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
			configDraft: await configDraftFor({ repositoryRepo: deps.repositoryRepo, machine }),
			policy: machine?.repositoryId ? { applyMigrations: machine.policy.applyMigrations } : null,
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
				})),
			memoryMaxBytes: opts.memoryMaxBytes
		}
	});

	if (!delivered) {
		await stall(deps, { queue: opts.queue, runId: run.id });

		return 'unreachable';
	}

	return 'sent';
}

async function dispatch(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem }
): Promise<DispatchOutcome> {
	const memoryMaxBytes = await memoryLimitFor(deps, opts);

	return memoryMaxBytes === 'waiting'
		? 'waiting'
		: startBullet(deps, { ...opts, memoryMaxBytes });
}

// A plan waits for its blockers wherever in the project they were queued, not
// only here. `blockerHolds` carries the rule and the reasoning behind it.
//
// `items` is this queue as the caller now understands it, which is ahead of the
// database for exactly one row: the item just closed above. Overlaying it is
// what stops the plan waiting on it being skipped for a blocker that finished a
// line ago.
async function blockedPlanIds(deps: AdvanceDeps, items: QueueItem[]): Promise<string[]> {
	const queued = items.filter((item) => item.status === 'queued');

	if (queued.length === 0) {
		return [];
	}

	const edges = await deps.planBlockerRepo.listEdges(queued.map((item) => item.planId));

	if (edges.length === 0) {
		return [];
	}

	const statuses = await deps.queueItemRepo.statusesForPlans([
		...new Set(edges.map((edge) => edge.blockedByPlanId))
	]);

	for (const item of items) {
		statuses.set(item.planId, [...(statuses.get(item.planId) ?? []), item.status]);
	}

	return queued
		.filter((item) =>
			edges.some(
				(edge) =>
					edge.planId === item.planId &&
					blockerHolds(statuses.get(edge.blockedByPlanId))
			)
		)
		.map((item) => item.planId);
}

// `bosun/plan/...` rather than `bosun/<queue>/...`: the worktree already holds a
// branch named for the queue, and git cannot have a ref that is both a leaf and
// a directory. Two queues can run the same plan, so the queue slug stays in the
// name to keep those apart.
function planBranch(opts: { queueSlug: string; plan: Plan }): string {
	const title = toQueueSlug(opts.plan.title ?? '');

	return `bosun/plan/${opts.queueSlug}/${opts.plan.number}${title === '' ? '' : `-${title}`}`;
}

// The title and body travel either way: a machine with no repository opens the
// pull request with them itself, and a repository machine only pushes — the
// backend opens it through the App when `queue.pushed` comes back.
async function requestPublish(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem }
): Promise<void> {
	const publishable = await publishablePlan(deps, opts);

	if (!publishable) {
		return;
	}

	const { plan, branch, baseRef } = publishable;
	const text = await pullRequestText(deps, publishable);
	const published = deps.socketRegistry.sendToAgent({
		machineId: opts.queue.machineId,
		message: {
			type: 'queue.publish',
			itemId: opts.item.id,
			worktreePath: opts.queue.worktreePath!,
			branch,
			baseRef,
			title: text.title,
			body: text.body
		}
	});

	// After the pull request, never instead of it. The branch is the deliverable
	// and the map is a convenience, so a machine that fails to write one has still
	// shipped the work.
	if (plan.bodyMd) {
		deps.socketRegistry.sendToAgent({
			machineId: opts.queue.machineId,
			message: {
				type: 'queue.summarize',
				planId: plan.id,
				worktreePath: opts.queue.worktreePath!,
				branch,
				baseRef,
				planTitle: plan.title ?? 'Untitled plan',
				planBodyMd: plan.bodyMd
			}
		});
	}

	// The item stays `done`: every bullet landed and the commits are on the
	// machine, so nothing about the work is in doubt. What did not happen is the
	// pull request, and an item that reads `done` with no `prUrl` is
	// indistinguishable from a plan nobody wanted one for — so the reason is
	// written down rather than left for somebody to notice the PR missing.
	if (!published) {
		await deps.queueItemRepo.update({
			id: opts.item.id,
			failureReason: 'the machine was not reachable to open the pull request'
		});
	}
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

	if (running) {
		const outcome = await dispatch(deps, { queue, item: running });

		if (outcome === 'sent') {
			await setStatus(deps, { queue, status: 'running' });

			return;
		}

		// `stall` has already paused the queue and put the bullet back. Falling
		// through would find that bullet pending and set the queue running again,
		// which is the paused row being overwritten by the thing that paused it.
		if (outcome === 'unreachable') {
			return;
		}
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

	const outcome = await dispatch(deps, { queue, item: next });

	// A plan waiting on memory has started as far as this queue is concerned: its
	// item is claimed and its bullets are pending. Falling through would close it
	// as done without it having run a line.
	if (outcome === 'sent' || outcome === 'waiting') {
		await setStatus(deps, { queue, status: 'running' });

		return;
	}

	// Closing the item here would mark a plan done that never ran a line of it,
	// and recursing would walk the whole queue doing the same to every plan in it.
	if (outcome === 'unreachable') {
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
