// Push-only: no precaching, no offline shell. The app used to ship a Workbox
// worker that answered every navigation from a precached shell — replacing the
// script here is enough for an already-installed browser to move on to this one,
// since a service worker re-fetches its script on every load and installs
// whatever changed.
self.addEventListener('install', () => {
	self.skipWaiting()
})

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
	if (!event.data) {
		return
	}

	const payload = event.data.json()

	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			data: { url: payload.url, notificationId: payload.notificationId }
		})
	)
})

// The worker holds no session of its own — every token lives with supabase-js on
// the page — so marking the notification read is handed to an open client
// instead of attempted here.
self.addEventListener('notificationclick', (event) => {
	const data = event.notification.data ?? {}

	event.notification.close()

	event.waitUntil((async () => {
		const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
		const targetPath = data.url ? new URL(data.url).pathname : null
		const existing = windows.find((client) => !targetPath || new URL(client.url).pathname === targetPath) ?? windows[0]

		if (existing) {
			if (targetPath && new URL(existing.url).pathname !== targetPath && 'navigate' in existing) {
				await existing.navigate(data.url)
			}

			existing.postMessage({ type: 'notification-click', notificationId: data.notificationId })
			await existing.focus()

			return
		}

		if (!data.url) {
			return
		}

		// A page opened this way has not run its own JS yet, so a `postMessage` sent
		// the moment it exists races its listener and is easily lost — the query
		// param survives that race, and the page reads it once it has mounted.
		const target = new URL(data.url)

		if (data.notificationId) {
			target.searchParams.set('readNotification', data.notificationId)
		}

		await self.clients.openWindow(target.href)
	})())
})
