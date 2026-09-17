import { dispatchNotification } from 'src/controllers/notifications/dispatch-notification';
import { planName, resolveRecipients, type PlanNotifyRecipientDeps } from 'src/controllers/plans/shared/notify-recipients';
import { type NotificationKind } from 'src/types/NotificationSchema';
import { type Plan, type PlanMessage, type PlanStatus } from 'src/types/PlanSchema';

export type PlanNotifyDeps = PlanNotifyRecipientDeps;

const STATUS_KIND: Partial<Record<PlanStatus, NotificationKind>> = {
	ready: 'plan.ready',
	failed: 'plan.failed'
};

// A no-op for `planning`: it is not a terminal state, and nothing should be
// told about a plan that has not finished yet.
export async function notifyPlanStatus(deps: PlanNotifyDeps, opts: { plan: Plan }): Promise<void> {
	const kind = STATUS_KIND[opts.plan.status];

	if (!kind) {
		return;
	}

	const recipientIds = await resolveRecipients(deps, opts.plan);
	const name = planName(opts.plan);

	await dispatchNotification(deps, {
		recipientIds,
		projectId: opts.plan.projectId,
		kind,
		title: opts.plan.status === 'ready' ? 'Plan ready' : 'Plan failed',
		body:
			opts.plan.status === 'failed' && opts.plan.failureReason
				? `${name}: ${opts.plan.failureReason}`
				: `${name} is ${opts.plan.status}`,
		url: `${deps.appUrl}/plans/${opts.plan.id}`,
		planId: opts.plan.id
	});
}

// A no-op unless this is a `question` on a plan a live person is watching: a
// `user`/`answer` row echoes back what was already said, an `assistant` line
// is routine narration, and an auto-mode plan answers every question it
// raises itself (see agent/src/planning/README.md) — none of those is an
// actual question that needs a person's response.
export async function notifyPlanMessage(
	deps: PlanNotifyDeps,
	opts: { plan: Plan; message: PlanMessage }
): Promise<void> {
	if (opts.plan.auto || opts.message.role !== 'question') {
		return;
	}

	const recipientIds = await resolveRecipients(deps, opts.plan);
	const body = opts.message.content.questions[0]?.question ?? 'has a question for you';

	await dispatchNotification(deps, {
		recipientIds,
		projectId: opts.plan.projectId,
		kind: 'plan.message',
		title: `${planName(opts.plan)} needs your answer`,
		body,
		url: `${deps.appUrl}/plans/${opts.plan.id}`,
		planId: opts.plan.id
	});
}
