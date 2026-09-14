import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { announceBuild, announceNeedsYou, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { type PlanAnswer } from 'src/types/PlanSchema';

// Two cases. A session still inside its tool call gets the answer and carries on.
// One whose slot was released gets its answer stored on the run, and the build goes
// to the front of the line so the bullet restarts with it as soon as a slot frees.
export async function answerRun(
	deps: LineDeps,
	opts: { runId: string; questionId: string; answers: PlanAnswer[]; projectId: string }
): Promise<void> {
	const run = await deps.sliceRunRepo.getById(opts.runId);
	const build = run ? await deps.buildRepo.getOwnedById({ id: run.buildId, projectId: opts.projectId }) : null;

	if (!run || !build) {
		throw new HttpError(404, 'Run not found');
	}

	// A stale panel — open in a tab while somebody else answered — must not answer a
	// question the plan has moved past.
	if (run.questionId !== opts.questionId || run.question === null) {
		throw new HttpError(409, 'That question has already been answered');
	}

	if (run.status === 'running') {
		// Delivered before the question is cleared: the other order loses both halves
		// when the socket is gone.
		const delivered =
			build.machineId !== null &&
			deps.socketRegistry.sendToAgent({
				machineId: build.machineId,
				message: { type: 'exec.answer', runId: run.id, questionId: opts.questionId, answers: opts.answers }
			});

		if (!delivered) {
			throw new HttpError(409, 'this machine is offline');
		}

		await deps.sliceRunRepo.update({ id: run.id, questionId: null, question: null, questionAskedAt: null });
	} else {
		await deps.sliceRunRepo.update({
			id: run.id,
			answer: { questionId: opts.questionId, questions: run.question, answers: opts.answers },
			questionId: null,
			question: null,
			questionAskedAt: null
		});

		const resumed = await deps.buildRepo.transition({
			id: build.id,
			from: ['waiting_answer'],
			changes: { status: 'scheduled', position: await deps.buildRepo.frontPosition(build.repositoryId) }
		});

		if (resumed) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, build: resumed });
		}
	}

	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, planId: build.planId });
	announceNeedsYou({ socketRegistry: deps.socketRegistry, projectId: opts.projectId });

	if (build.machineId !== null) {
		await scheduleMachine(deps, { machineId: build.machineId });
	}
}
