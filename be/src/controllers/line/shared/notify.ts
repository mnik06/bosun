import { dispatchNotification } from 'src/controllers/notifications/dispatch-notification';
import { planName, resolveRecipients, type PlanNotifyRecipientDeps } from 'src/controllers/plans/shared/notify-recipients';
import { type Build, type BuildStatus } from 'src/types/BuildSchema';
import { type NotificationKind } from 'src/types/NotificationSchema';
import { type Plan } from 'src/types/PlanSchema';

export type BuildNotifyDeps = PlanNotifyRecipientDeps;

const STATUS_KIND: Partial<Record<BuildStatus, NotificationKind>> = {
	waiting_answer: 'build.waiting_answer',
	needs_you: 'build.needs_you',
	merged: 'build.merged',
	failed: 'build.failed',
	in_review: 'build.in_review',
	cancelled: 'build.cancelled'
};

const STATUS_TITLE: Partial<Record<BuildStatus, string>> = {
	waiting_answer: 'Waiting for an answer',
	needs_you: 'Needs you',
	merged: 'Merged',
	failed: 'Build failed',
	in_review: 'In review',
	cancelled: 'Cancelled'
};

const STATUS_SUMMARY: Partial<Record<BuildStatus, string>> = {
	waiting_answer: 'is waiting for an answer',
	needs_you: 'needs you',
	merged: 'merged',
	failed: 'failed',
	in_review: 'is in review',
	cancelled: 'was cancelled'
};

// A no-op for every status but the four the plan calls out: everything else is a
// build moving through its own work, not something a person needs to be pulled
// away to see.
export async function notifyBuildStatus(deps: BuildNotifyDeps, opts: { plan: Plan; build: Build }): Promise<void> {
	const kind = STATUS_KIND[opts.build.status];

	if (!kind) {
		return;
	}

	const recipientIds = await resolveRecipients(deps, opts.plan);
	const name = planName(opts.plan);

	await dispatchNotification(deps, {
		recipientIds,
		projectId: opts.plan.projectId,
		kind,
		title: STATUS_TITLE[opts.build.status]!,
		body: opts.build.failureReason ? `${name}: ${opts.build.failureReason}` : `${name} ${STATUS_SUMMARY[opts.build.status]}`,
		url: `${deps.appUrl}/plans/${opts.plan.id}`,
		planId: opts.plan.id
	});
}

// Every dependency a plan was waiting on just became released. Same recipient
// rule as every other build-scoped trigger: the plan's own creator, or every
// leader when the plan carries no attribution.
export async function notifyPlanUnblocked(deps: BuildNotifyDeps, opts: { plan: Plan }): Promise<void> {
	const recipientIds = await resolveRecipients(deps, opts.plan);
	const name = planName(opts.plan);

	await dispatchNotification(deps, {
		recipientIds,
		projectId: opts.plan.projectId,
		kind: 'plan.unblocked',
		title: 'Unblocked',
		body: `${name} is unblocked`,
		url: `${deps.appUrl}/plans/${opts.plan.id}`,
		planId: opts.plan.id
	});
}
