import { type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type Plan } from 'src/types/PlanSchema';

export interface PlanNotifyRecipientDeps extends DispatchNotificationDeps {
	projectMemberRepo: ProjectMemberRepo;
	// The web app's origin: a push notification deep-links back to the plan.
	appUrl: string;
}

export function planName(plan: Plan): string {
	return plan.title ?? `Plan #${plan.number}`;
}

// A plan's creator is who asked for it, so they are who is told about it.
// `createdByUserId` is nullable only for plans written before that column
// existed, and every leader is the same fallback every other trigger uses when
// a write carries no user attribution.
export async function resolveRecipients(deps: PlanNotifyRecipientDeps, plan: Plan): Promise<string[]> {
	if (plan.createdByUserId) {
		return [plan.createdByUserId];
	}

	return deps.projectMemberRepo.listLeaders(plan.projectId);
}
