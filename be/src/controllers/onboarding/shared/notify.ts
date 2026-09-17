import { dispatchNotification } from 'src/controllers/notifications/dispatch-notification';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { type NotificationKind } from 'src/types/NotificationSchema';
import { type OnboardingRun, type OnboardingStatus } from 'src/types/OnboardingSchema';

const KIND: Partial<Record<OnboardingStatus, NotificationKind>> = {
	needs_input: 'onboarding.needs_input',
	ready: 'onboarding.ready',
	failed: 'onboarding.failed'
};

const SUMMARY: Partial<Record<OnboardingStatus, string>> = {
	needs_input: 'needs input to continue',
	ready: 'is ready',
	failed: 'failed'
};

// Onboarding carries no user attribution — only a run and a machine — so every
// leader of the project is told, the same fallback every machine-scoped event
// falls back to. A no-op for any status but the three the plan calls out:
// `discovering`/`verifying` are routine progress, not something a person acts on.
export async function notifyOnboardingStatus(deps: OnboardingDeps, opts: { projectId: string; run: OnboardingRun }): Promise<void> {
	const kind = KIND[opts.run.status];

	if (!kind) {
		return;
	}

	const machine = await deps.machineRepo.getById(opts.run.machineId);
	const name = machine?.name ?? 'A machine';
	const summary = SUMMARY[opts.run.status];
	const recipientIds = await deps.projectMemberRepo.listLeaders(opts.projectId);

	await dispatchNotification(deps, {
		recipientIds,
		projectId: opts.projectId,
		kind,
		title: `Onboarding ${summary}`,
		body: opts.run.status === 'failed' && opts.run.failureReason ? `${name}: ${opts.run.failureReason}` : `${name} — onboarding ${summary}`,
		url: `${deps.appUrl}/machines/${opts.run.machineId}`
	});
}
