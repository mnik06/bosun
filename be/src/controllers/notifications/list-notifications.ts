import { type NotificationRepo } from 'src/repos/notifications/notification.repo';
import { type Notification } from 'src/types/NotificationSchema';

const DEFAULT_LIMIT = 50;

// The route schema already caps `limit` at 100 — this only fills in the default
// when the query omits it.
export async function listNotifications(
	deps: { notificationRepo: NotificationRepo },
	opts: { userId: string; projectId: string; unreadOnly: boolean; limit?: number }
): Promise<Notification[]> {
	return deps.notificationRepo.list({
		userId: opts.userId,
		projectId: opts.projectId,
		unreadOnly: opts.unreadOnly,
		limit: opts.limit ?? DEFAULT_LIMIT
	});
}
