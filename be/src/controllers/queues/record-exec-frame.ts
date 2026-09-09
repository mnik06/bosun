import { advanceMachine, advanceQueue } from 'src/controllers/queues/advance-queue';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { acGateFailure } from 'src/controllers/queues/shared/ac-gate';
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
	opts: { machineId: string; projectId: string; frame: ExecFrame }
): Promise<void> {
	const located = await locate(deps, { runId: opts.frame.runId, machineId: opts.machineId });

	if (!located) {
		return;
	}

	const { frame } = opts;

	if (frame.type === 'exec.activity') {
		deps.runActivity.record({ runId: frame.runId, label: frame.label });
	}

	if (frame.type === 'exec.text' || frame.type === 'exec.activity') {
		deps.socketRegistry.broadcastToUi({
			projectId: opts.projectId,
			message:
				frame.type === 'exec.text'
					? { type: 'run.text', runId: frame.runId, delta: frame.delta }
					: { type: 'run.activity', runId: frame.runId, label: frame.label }
		});

		return;
	}

	if (frame.type === 'exec.question') {
		await deps.sliceRunRepo.setQuestion({
			id: frame.runId,
			questionId: frame.questionId,
			question: frame.questions
		});
		await deps.queueRepo.update({ id: located.queue.id, status: 'blocked' });
		deps.socketRegistry.broadcastToUi({
			projectId: opts.projectId,
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
		const gate = await acGateFailure(deps, {
			planId: located.item.planId,
			machineId: opts.machineId,
			sliceId: located.run.sliceId
		});

		if (gate === null) {
			deps.runActivity.forget(frame.runId);
			await deps.sliceRunRepo.update({
				id: frame.runId,
				status: 'done',
				questionId: null,
				question: null,
				commitSha: frame.commitSha,
				report: frame.report,
				finishedAt: new Date()
			});
			await advanceQueue(deps, { queueId: located.queue.id });
			await advanceMachine(deps, { machineId: opts.machineId });

			return;
		}

		await failRun(deps, { ...opts, located, runId: frame.runId, message: gate, report: frame.report });

		return;
	}

	await failRun(deps, { ...opts, located, runId: frame.runId, message: frame.message });
}

// A bullet that failed ends its plan and nothing else. The partial work stays on
// that plan's own branch, and the queue carries on with the next plan — which is
// only safe because each plan is cut from baseRef rather than from whatever the
// last one left behind.
async function failRun(
	deps: AdvanceDeps,
	opts: {
		machineId: string;
		located: NonNullable<Awaited<ReturnType<typeof locate>>>;
		runId: string;
		message: string;
		report?: string;
	}
): Promise<void> {
	deps.runActivity.forget(opts.runId);
	await deps.sliceRunRepo.update({
		id: opts.runId,
		status: 'failed',
		failureReason: opts.message,
		// Kept even here — especially here. A gate failure is unreadable without
		// what the session said it did.
		...(opts.report === undefined ? {} : { report: opts.report }),
		questionId: null,
		question: null,
		finishedAt: new Date()
	});
	await deps.queueItemRepo.update({
		id: opts.located.item.id,
		status: 'failed',
		failureReason: opts.message,
		finishedAt: new Date()
	});
	await advanceQueue(deps, { queueId: opts.located.queue.id });
	// This queue may have just handed its slot back, so anything on the machine
	// that was held at the cap gets to start now rather than on the next nudge.
	await advanceMachine(deps, { machineId: opts.machineId });
}
