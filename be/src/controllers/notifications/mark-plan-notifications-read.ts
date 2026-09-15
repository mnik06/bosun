import { type NotificationRepo } from 'src/repos/notifications/notification.repo';

export async function markPlanNotificationsRead(
	deps: { notificationRepo: NotificationRepo },
	opts: { userId: string; projectId: string; planId: string }
): Promise<number> {
	return deps.notificationRepo.markReadForPlan(opts);
}
