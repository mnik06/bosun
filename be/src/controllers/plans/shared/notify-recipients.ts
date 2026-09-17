import { type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type ResolveRecipientsDeps } from 'src/controllers/notifications/shared/resolve-recipients';
import { type Plan } from 'src/types/PlanSchema';

export interface PlanNotifyRecipientDeps extends DispatchNotificationDeps, ResolveRecipientsDeps {
	// The web app's origin: a push notification deep-links back to the plan.
	appUrl: string;
}

export function planName(plan: Plan): string {
	return plan.title ?? `Plan #${plan.number}`;
}
