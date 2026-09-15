import { dispatchNotification, type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type NotificationKind } from 'src/types/NotificationSchema';
import { type Plan, type PlanMessage, type PlanStatus } from 'src/types/PlanSchema';

export interface PlanNotifyDeps extends DispatchNotificationDeps {
	projectMemberRepo: ProjectMemberRepo;
	// The web app's origin: a push notification deep-links back to the plan.
	appUrl: string;
}

const STATUS_KIND: Partial<Record<PlanStatus, NotificationKind>> = {
	ready: 'plan.ready',
	failed: 'plan.failed'
};

function planName(plan: Plan): string {
	return plan.title ?? `Plan #${plan.number}`;
}

// A plan's creator is who asked for it, so they are who is told how it turned
// out. `createdByUserId` is nullable only for plans written before that column
// existed, and every leader is the same fallback every other trigger uses when
// a write carries no user attribution.
async function resolveRecipients(deps: PlanNotifyDeps, plan: Plan): Promise<string[]> {
	if (plan.createdByUserId) {
		return [plan.createdByUserId];
	}

	return deps.projectMemberRepo.listLeaders(plan.projectId);
}

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
