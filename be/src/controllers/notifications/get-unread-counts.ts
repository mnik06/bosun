import { type NotificationRepo } from 'src/repos/notifications/notification.repo';

export async function getUnreadCounts(
	deps: { notificationRepo: NotificationRepo },
	opts: { userId: string; projectId: string }
): Promise<Array<{ planId: string; count: number }>> {
	return deps.notificationRepo.unreadCountsByPlan(opts);
}
