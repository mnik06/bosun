import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedQueue } from 'src/controllers/queues/shared/queue-access';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueMessageRepo } from 'src/repos/queues/queue-message.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type QueueMessage } from 'src/types/QueueSchema';

export interface AskDeps {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	queueMessageRepo: QueueMessageRepo;
	sliceRunRepo: SliceRunRepo;
	planRepo: PlanRepo;
	sliceRepo: SliceRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
}

// Only the last few. The session reads the worktree for anything older, and a
// transcript that grows without bound eventually costs more than the question.
const TRANSCRIPT_KEPT = 12;

// What bosun knows and the worktree does not say: which bullets ran, which
// failed and why. Everything else — what the code does, what a commit changed —
// the session finds by looking, which is the point of running it in there.
async function describeState(deps: AskDeps, queueId: string): Promise<string> {
	const queue = await deps.queueRepo.getById(queueId);

	if (!queue) {
		return 'This queue no longer exists.';
	}

	const items = await deps.queueItemRepo.listForQueue(queue.id);
	const lines = await Promise.all(
		items.map(async (item) => {
			const plan = await deps.planRepo.getByIdForMachine({
				id: item.planId,
				machineId: queue.machineId
			});
			const slices = await deps.sliceRepo.listByPlan(item.planId);
			const byId = new Map(slices.map((slice) => [slice.id, slice]));
			const runs = await deps.sliceRunRepo.listForItem(item.id);
			const bullets = runs
				.map((run) => {
					const title = byId.get(run.sliceId)?.title ?? 'a bullet';
					const why = run.failureReason === null ? '' : ` — ${run.failureReason}`;
					const sha = run.commitSha === null ? '' : ` (${run.commitSha.slice(0, 8)})`;

					return `    ${run.ordinal}. ${title} — ${run.status}${sha}${why}`;
				})
				.join('\n');

			return [
				`- #${plan?.number ?? '?'} ${plan?.title ?? 'Untitled'} — ${item.status}`,
				item.branch === null ? '' : `    branch: ${item.branch}`,
				item.failureReason === null ? '' : `    failed: ${item.failureReason}`,
				item.prUrl === null ? '' : `    pull request: ${item.prUrl}`,
				bullets
			]
				.filter(Boolean)
				.join('\n');
		})
	);

	return [
		`Queue "${queue.name}" — ${queue.status}${queue.afk ? ', AFK' : ''}`,
		`Worktree: ${queue.worktreePath ?? 'not created yet'}, cut from ${queue.baseRef ?? 'unknown'}`,
		`Ports: ${queue.portBase}-${queue.portBase + 9}`,
		queue.failureReason === null ? '' : `Queue failure: ${queue.failureReason}`,
		'',
		'Plans, in the order they run:',
		lines.length === 0 ? '  (nothing queued)' : lines.join('\n')
	]
		.filter((line) => line !== undefined)
		.join('\n');
}

export async function askQueue(
	deps: AskDeps,
	opts: { queueId: string; userId: string; question: string }
): Promise<QueueMessage> {
	const queue = await getOwnedQueue({
		queueRepo: deps.queueRepo,
		id: opts.queueId,
		userId: opts.userId
	});

	if (queue.worktreePath === null) {
		throw new HttpError(409, 'That queue has no worktree yet');
	}

	const message = await deps.queueMessageRepo.create({
		id: deps.idService.createQueueMessageId(),
		queueId: queue.id,
		role: 'user',
		content: opts.question
	});

	const transcript = await deps.queueMessageRepo.listForQueue(queue.id);

	deps.socketRegistry.broadcastToUi({
		userId: opts.userId,
		message: { type: 'queue.message', message }
	});
	deps.socketRegistry.sendToAgent({
		machineId: queue.machineId,
		message: {
			type: 'queue.ask',
			queueId: queue.id,
			askId: message.id,
			worktreePath: queue.worktreePath,
			question: opts.question,
			state: await describeState(deps, queue.id),
			transcript: transcript
				.slice(-TRANSCRIPT_KEPT, -1)
				.map((entry) => ({ role: entry.role, content: entry.content }))
		}
	});

	return message;
}
