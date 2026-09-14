import { type FastifyBaseLogger } from 'fastify';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { announceBuild } from 'src/controllers/line/shared/announce';

// How long a question holds its build slot. Long enough for somebody at the desk to
// answer; short enough that one question does not keep a slot from the next plan
// for an afternoon.
export const QUESTION_HOLD_MS = 10 * 60 * 1000;

const SWEEP_MS = 30 * 1000;

// Past the hold the session is cancelled and its run put back with the question
// still on it. The answer, when it comes, is stored on the run and the bullet
// restarts with it in its prompt. One question stops one plan.
export async function releaseStaleQuestions(deps: LineDeps, opts: { now: Date }): Promise<void> {
	const stale = await deps.sliceRunRepo.listQuestionsAskedBefore(new Date(opts.now.getTime() - QUESTION_HOLD_MS));

	for (const run of stale) {
		const build = await deps.buildRepo.getById(run.buildId);
		const plan = build ? await deps.planRepo.getById(build.planId) : null;

		if (!build || !plan || build.status !== 'building' || build.machineId === null) {
			continue;
		}

		deps.socketRegistry.sendToAgent({ machineId: build.machineId, message: { type: 'exec.cancel', runId: run.id } });
		deps.runActivity.forget(run.id);
		await deps.sliceRunRepo.update({ id: run.id, status: 'pending', startedAt: null });

		const waiting = await deps.buildRepo.update({ id: build.id, status: 'waiting_answer' });

		if (waiting) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: waiting });
		}

		await scheduleMachine(deps, { machineId: build.machineId });
	}
}

export function startQuestionSweep(opts: { deps: LineDeps; log: FastifyBaseLogger }): () => void {
	const timer = setInterval(() => {
		releaseStaleQuestions(opts.deps, { now: new Date() }).catch((error: unknown) => {
			opts.log.error({ error }, 'failed releasing questions past their hold');
		});
	}, SWEEP_MS);

	timer.unref();

	return () => {
		clearInterval(timer);
	};
}
