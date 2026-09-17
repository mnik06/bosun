import { type NotificationRepo } from 'src/repos/notifications/notification.repo';
import { type Notification } from 'src/types/NotificationSchema';
import { orNotFound } from 'src/utils/general';

export async function markNotificationRead(
	deps: { notificationRepo: NotificationRepo },
	opts: { id: string; userId: string }
): Promise<Notification> {
	return orNotFound(deps.notificationRepo.markRead(opts), 'Notification not found');
}
