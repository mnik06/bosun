import { HttpError } from 'src/api/errors/HttpError';
import { type NotificationRepo } from 'src/repos/notifications/notification.repo';
import { type Notification } from 'src/types/NotificationSchema';

export async function markNotificationRead(
	deps: { notificationRepo: NotificationRepo },
	opts: { id: string; userId: string }
): Promise<Notification> {
	const notification = await deps.notificationRepo.markRead(opts);

	if (!notification) {
		throw new HttpError(404, 'Notification not found');
	}

	return notification;
}
