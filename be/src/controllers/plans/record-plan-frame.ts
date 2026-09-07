import { failPlan } from 'src/controllers/plans/fail-plan';
import { finishPlan } from 'src/controllers/plans/finish-plan';
import { announcePlanMessage } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { createPlanMessageId } from 'src/services/ids/id.service';
import { appendPlanText, takePlanText } from 'src/services/plans/plan-text.service';
import { broadcastToPlan } from 'src/services/sockets/registry.service';
import { type AgentMsg } from 'src/types/protocol';
import { type Plan } from 'src/types/PlanSchema';

type PlanFrame = Extract<AgentMsg, { type: `plan.${string}` }>;

interface Deps {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	acRepo: AcRepo;
}

// Whatever prose the session produced since its last tool call, question or
// terminal frame is one complete assistant turn. Flushing it here is what makes
// the transcript re-renderable without persisting a row per delta.
async function flushText(opts: Deps & { planId: string }): Promise<void> {
	const text = takePlanText(opts.planId);

	if (!text) {
		return;
	}

	const message = await opts.planMessageRepo.append({
		id: createPlanMessageId(),
		planId: opts.planId,
		role: 'assistant',
		content: { text }
	});

	announcePlanMessage({ planId: opts.planId, message });
}

async function recordQuestion(
	opts: Deps & { plan: Plan; frame: Extract<PlanFrame, { type: 'plan.question' }> }
): Promise<void> {
	const message = await opts.planMessageRepo.append({
		id: createPlanMessageId(),
		planId: opts.plan.id,
		role: 'question',
		content: { questionId: opts.frame.questionId, questions: opts.frame.questions }
	});

	announcePlanMessage({ planId: opts.plan.id, message });
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

	broadcastToPlan({ planId: plan.id, message: opts.frame });

	if (opts.frame.type === 'plan.text') {
		appendPlanText({ planId: plan.id, delta: opts.frame.delta });

		return;
	}

	await flushText({ ...opts, planId: plan.id });

	if (opts.frame.type === 'plan.question') {
		await recordQuestion({ ...opts, plan, frame: opts.frame });

		return;
	}

	if (opts.frame.type === 'plan.done') {
		await finishPlan({ planRepo: opts.planRepo, acRepo: opts.acRepo, plan });

		return;
	}

	if (opts.frame.type === 'plan.error') {
		await failPlan({ planRepo: opts.planRepo, plan, reason: opts.frame.message });
	}
}
