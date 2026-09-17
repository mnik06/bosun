import { dispatchNotification } from 'src/controllers/notifications/dispatch-notification';
import { resolveRecipients } from 'src/controllers/notifications/shared/resolve-recipients';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { quickFixSummary } from 'src/controllers/quick-fixes/shared/quick-fix-text';
import { type NotificationKind } from 'src/types/NotificationSchema';
import { type QuickFix } from 'src/types/QuickFixSchema';

const KIND: Record<'pushed' | 'failed', NotificationKind> = {
	pushed: 'quickfix.pushed',
	failed: 'quickfix.failed'
};

// A no-op for `running`: this is reached only from a terminal settle, but the
// type admits every status a quick fix has. Every other notification kind's
// `url` is an in-app route — the bell menu and the push service worker both
// resolve it that way — but there is no quick-fix page to point a `pushed`
// one at, so its url is the pull request itself; the bell menu opens an
// off-origin url as a real link instead of an app route (see
// `isExternalNotificationUrl`). A `failed` one has no pull request, so it
// falls back to the machine the fix ran on, same as onboarding does for a run
// with no page of its own.
export async function notifyQuickFixStatus(deps: LineDeps, opts: { quickFix: QuickFix }): Promise<void> {
	const { quickFix } = opts;

	if (quickFix.status !== 'pushed' && quickFix.status !== 'failed') {
		return;
	}

	const recipientIds = await resolveRecipients(deps, quickFix);
	const summary = quickFixSummary(quickFix.description);
	const label = summary === '' ? 'A quick fix' : summary;

	await dispatchNotification(deps, {
		recipientIds,
		projectId: quickFix.projectId,
		kind: KIND[quickFix.status],
		title: quickFix.status === 'pushed' ? 'Quick fix pushed' : 'Quick fix failed',
		body: quickFix.status === 'pushed' ? `${label} — pull request opened` : `${label}: ${quickFix.error ?? 'failed'}`,
		url: quickFix.status === 'pushed' && quickFix.prUrl ? quickFix.prUrl : `${deps.appUrl}/machines/${quickFix.machineId}`,
		quickFixId: quickFix.id
	});
}
