import { failPlan } from 'src/controllers/plans/fail-plan';
import { finishPlan } from 'src/controllers/plans/finish-plan';
import { announcePlanMessage } from 'src/controllers/plans/shared/plan-broadcast';
import { notifyPlanMessage, type PlanNotifyDeps } from 'src/controllers/plans/shared/notify';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type AgentMsg } from 'src/types/protocol';
import { type Plan } from 'src/types/PlanSchema';

type PlanFrame = Extract<AgentMsg, { type: `plan.${string}` }>;

interface Deps extends PlanNotifyDeps {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	acRepo: AcRepo;
	idService: IdService;
	planTextService: PlanTextService;
}

// Whatever prose the session produced since its last tool call, question or
// terminal frame is one complete assistant turn. Flushing it here is what makes
// the transcript re-renderable without persisting a row per delta.
async function flushText(opts: Deps & { plan: Plan }): Promise<void> {
	const text = opts.planTextService.take(opts.plan.id);

	if (!text) {
		return;
	}

	const message = await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: opts.plan.id,
		role: 'assistant',
		content: { text }
	});

	announcePlanMessage({
		socketRegistry: opts.socketRegistry,
		planId: opts.plan.id,
		message
	});

	await notifyPlanMessage(opts, { plan: opts.plan, message });
}

async function recordQuestion(
	opts: Deps & { plan: Plan; frame: Extract<PlanFrame, { type: 'plan.question' }> }
): Promise<void> {
	const message = await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: opts.plan.id,
		role: 'question',
		content: { questionId: opts.frame.questionId, questions: opts.frame.questions }
	});

	announcePlanMessage({
		socketRegistry: opts.socketRegistry,
		planId: opts.plan.id,
		message
	});

	await notifyPlanMessage(opts, { plan: opts.plan, message });

	if (!opts.frame.autoAnswers) {
		return;
	}

	// An auto answer is written as an ordinary answer row. The transcript is the
	// only record of whether a question is still waiting, so a question left
	// without one would offer the person a prompt for a session that has already
	// moved past it and will never read the reply.
	const answer = await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: opts.plan.id,
		role: 'answer',
		content: { questionId: opts.frame.questionId, answers: opts.frame.autoAnswers }
	});

	announcePlanMessage({
		socketRegistry: opts.socketRegistry,
		planId: opts.plan.id,
		message: answer
	});
}

export async function recordPlanFrame(
	opts: Deps & { machineId: string; frame: PlanFrame }
): Promise<void> {
	const plan = await opts.planRepo.getByIdForMachine({
		id: opts.frame.planId,
		machineId: opts.machineId
	});

	// A frame for a plan this machine does not own is either a discarded session
	// still draining or a machine talking about somebody else's plan. Neither is
	// something to write.
	if (!plan) {
		return;
	}

	opts.socketRegistry.broadcastToPlan({ planId: plan.id, message: opts.frame });

	if (opts.frame.type === 'plan.text') {
		opts.planTextService.append({ planId: plan.id, delta: opts.frame.delta });

		return;
	}

	await flushText({ ...opts, plan });

	if (opts.frame.type === 'plan.question') {
		await recordQuestion({ ...opts, plan, frame: opts.frame });

		return;
	}

	if (opts.frame.type === 'plan.done') {
		await finishPlan({ ...opts, plan });

		return;
	}

	if (opts.frame.type === 'plan.error') {
		await failPlan({ ...opts, plan, reason: opts.frame.message });
	}
}
