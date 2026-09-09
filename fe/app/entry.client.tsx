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

// Everything the UI shows is fetched live, so a stale shell buys nothing and an
// installed home-screen copy running last week's bundle against this week's API
// is a support ticket. The worker skips waiting, so a new one takes over as soon
// as it is fetched and the page reloads onto it.
function registerServiceWorker () {
	if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
		return
	}

	// A first visit has no controller, and the worker claiming the page then is
	// not an update — reloading on it would restart the app on every cold start.
	const wasControlled = navigator.serviceWorker.controller !== null
	let reloading = false

	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!wasControlled || reloading) {
			return
		}

		reloading = true
		window.location.reload()
	})

	navigator.serviceWorker
		.register('/sw.js')
		.then((registration) => {
			// An installed app is resumed rather than loaded, so without this it can
			// sit on the build it was opened with for days.
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') {
					void registration.update()
				}
			})
		})
		.catch(() => {
			// An app that cannot register a worker is an app without offline support,
			// not a broken one.
		})
}

registerServiceWorker()
