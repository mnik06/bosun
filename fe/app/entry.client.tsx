import { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'

import { apiClient } from '~/shared/api'

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<HydratedRouter />
		</StrictMode>
	)
})

function markNotificationRead (notificationId: string): void {
	apiClient.post(`/notifications/${notificationId}/read`).catch((error: unknown) => {
		console.error('Failed to mark notification read', error)
	})
}

if ('serviceWorker' in navigator) {
	void navigator.serviceWorker.register('/sw.js')

	// The worker holds no session of its own — every token lives with supabase-js
	// on this thread — so a notification click on an already-open tab hands the
	// click back here, where an authenticated call can mark it read.
	navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string, notificationId?: string }>) => {
		if (event.data.type === 'notification-click' && typeof event.data.notificationId === 'string') {
			markNotificationRead(event.data.notificationId)
		}
	})

	// A click that had to open a fresh tab carries the id as a query param instead
	// of a `postMessage`: the tab's listener above is not running yet at the moment
	// the worker would have sent one, and that message would be lost.
	const params = new URLSearchParams(window.location.search)
	const readNotification = params.get('readNotification')

	if (readNotification !== null) {
		markNotificationRead(readNotification)
		params.delete('readNotification')

		const query = params.toString()

		window.history.replaceState(null, '', `${window.location.pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`)
	}
}
