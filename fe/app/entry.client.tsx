import { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<HydratedRouter />
		</StrictMode>
	)
})

// Browsers that installed the old offline worker still have it registered, and it
// served them a precached shell that hard reloads bypassed and normal ones did not.
// `/sw.js` now removes itself, but only when the browser next checks it for an
// update; unregistering here too means one load of this bundle is enough.
if ('serviceWorker' in navigator) {
	void navigator.serviceWorker
		.getRegistrations()
		.then(async (registrations) => Promise.all(registrations.map(async (registration) => registration.unregister())))
}
