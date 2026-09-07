import { advanceMachine, advanceQueue, type AdvanceDeps } from 'src/controllers/queues/advance-queue';
import { type AgentMsg } from 'src/types/protocol';

type ExecFrame = Extract<AgentMsg, { type: `exec.${string}` }>;

// A run is the unit of authority here: the frame names a slice_run, and the
// queue it belongs to is derived rather than trusted, so an agent cannot settle
// a run on somebody else's machine by naming its id.
async function locate(deps: AdvanceDeps, opts: { runId: string; machineId: string }) {
	const run = await deps.sliceRunRepo.getById(opts.runId);

	if (!run) {
		return null;
	}

	const item = await deps.queueItemRepo.getById(run.queueItemId);
	const queue = item ? await deps.queueRepo.getById(item.queueId) : null;

	return queue && queue.machineId === opts.machineId ? { run, item: item!, queue } : null;
}

export async function recordExecFrame(
	deps: AdvanceDeps,
	opts: { machineId: string; userId: string; frame: ExecFrame }
): Promise<void> {
	const located = await locate(deps, { runId: opts.frame.runId, machineId: opts.machineId });

	if (!located) {
		return;
	}

	const { frame } = opts;

	if (frame.type === 'exec.text' || frame.type === 'exec.activity') {
		deps.socketRegistry.broadcastToUi({
			userId: opts.userId,
			message:
				frame.type === 'exec.text'
					? { type: 'run.text', runId: frame.runId, delta: frame.delta }
					: { type: 'run.activity', runId: frame.runId, label: frame.label }
		});

		return;
	}

	if (frame.type === 'exec.question') {
		await deps.queueRepo.update({ id: located.queue.id, status: 'blocked' });
		deps.socketRegistry.broadcastToUi({
			userId: opts.userId,
			message: {
				type: 'run.question',
				runId: frame.runId,
				questionId: frame.questionId,
				questions: frame.questions
			}
		});

		return;
	}

	if (frame.type === 'exec.done') {
		await deps.sliceRunRepo.update({
			id: frame.runId,
			status: 'done',
			commitSha: frame.commitSha,
			finishedAt: new Date()
		});
		await advanceQueue(deps, { queueId: located.queue.id });
		await advanceMachine(deps, { machineId: opts.machineId });

		return;
	}

	// A bullet that failed ends its plan and nothing else. The partial work stays
	// on that plan's own branch, and the queue carries on with the next plan —
	// which is only safe because each plan is cut from baseRef rather than from
	// whatever the last one left behind.
	await deps.sliceRunRepo.update({
		id: frame.runId,
		status: 'failed',
		failureReason: frame.message,
		finishedAt: new Date()
	});
	await deps.queueItemRepo.update({
		id: located.item.id,
		status: 'failed',
		failureReason: frame.message,
		finishedAt: new Date()
	});
	await advanceQueue(deps, { queueId: located.queue.id });
	// This queue may have just handed its slot back, so anything on the machine
	// that was held at the cap gets to start now rather than on the next nudge.
	await advanceMachine(deps, { machineId: opts.machineId });
}
