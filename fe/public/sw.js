// The app used to ship a Workbox worker that answered every navigation from a
// precached shell, and a browser keeps running an installed worker until the
// script at this URL changes. So this file must keep existing: it is the update
// that removes the old worker. Without it `/sw.js` is rewritten to index.html,
// the update check fails on the MIME type, and the stale worker stays for good.
self.addEventListener('install', () => {
	self.skipWaiting()
})

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		await Promise.all((await caches.keys()).map((key) => caches.delete(key)))
		await self.registration.unregister()

		const windows = await self.clients.matchAll({ type: 'window' })

		await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => null)))
	})())
})
