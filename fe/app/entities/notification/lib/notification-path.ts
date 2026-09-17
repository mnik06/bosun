import type { Notification } from '~/entities/notification/model/notification'

// The url a push deep-links to is absolute (it also has to work from the OS
// notification), but a Link inside this app should navigate client-side rather
// than reload — same trick sw.js already uses on the worker side.
export function notificationPath (notification: Notification): string {
	return new URL(notification.url).pathname
}

// Every other kind's url stays in-app, but a pushed quick fix has nowhere
// in-app to point to (there is no quick-fix page) — its url is the pull
// request itself, so the bell menu has to open it as a real link rather than
// resolving it to an app route that does not exist.
export function isExternalNotificationUrl (notification: Notification): boolean {
	return new URL(notification.url).origin !== window.location.origin
}
