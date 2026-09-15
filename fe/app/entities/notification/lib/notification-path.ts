import type { Notification } from '~/entities/notification/model/notification'

// The url a push deep-links to is absolute (it also has to work from the OS
// notification), but a Link inside this app should navigate client-side rather
// than reload — same trick sw.js already uses on the worker side.
export function notificationPath (notification: Notification): string {
	return new URL(notification.url).pathname
}
