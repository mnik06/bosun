import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanMessage } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type PlanAnswer } from 'src/types/PlanSchema';

export async function answerPlanQuestion(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
	questionId: string;
	answers: PlanAnswer[];
}): Promise<void> {
	const plan = await getOwnedPlan({ planRepo: opts.planRepo, id: opts.id, userId: opts.userId });

	if (plan.status !== 'planning') {
		throw new HttpError(409, 'this plan is no longer running');
	}

	const [question, existing] = await Promise.all([
		opts.planMessageRepo.findByQuestionId({
			planId: plan.id,
			questionId: opts.questionId,
			role: 'question'
		}),
		opts.planMessageRepo.findByQuestionId({
			planId: plan.id,
			questionId: opts.questionId,
			role: 'answer'
		})
	]);

	if (!question) {
		throw new HttpError(404, 'Question not found');
	}

	if (existing) {
		throw new HttpError(409, 'this question is already answered');
	}

	// Delivered before it is recorded: the tool call on the box is what the answer
	// is for, and a transcript holding an answer no session ever received would
	// read as though the grill had moved on when it had not.
	if (
		!opts.socketRegistry.sendToAgent({
			machineId: plan.machineId,
			message: {
				type: 'plan.answer',
				planId: plan.id,
				questionId: opts.questionId,
				answers: opts.answers
			}
		})
	) {
		throw new HttpError(409, 'this machine is offline');
	}

	const message = await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: plan.id,
		role: 'answer',
		content: { questionId: opts.questionId, answers: opts.answers }
	});

	announcePlanMessage({ socketRegistry: opts.socketRegistry, planId: plan.id, message });
}
