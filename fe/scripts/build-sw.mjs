import { generateSW } from 'workbox-build'

const CLIENT = 'build/client'

// Run after `react-router build`, never as a Vite plugin. React Router prerenders
// `index.html` in the build that follows the client one, so a worker generated
// from inside the client build precaches every hashed asset and misses the single
// document `navigateFallback` needs — the app then installs fine and shows nothing
// offline.
const { count, size, warnings } = await generateSW({
	globDirectory: CLIENT,
	swDest: `${CLIENT}/sw.js`,
	// The Fontsource variable faces ship one subset per script. Precaching them
	// would put megabytes of Cyrillic and Greek in front of the first paint, so
	// they are cached on demand below instead.
	globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
	globIgnores: ['sw.js', 'workbox-*.js'],
	dontCacheBustURLsMatching: /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/,
	navigateFallback: '/index.html',
	cleanupOutdatedCaches: true,
	clientsClaim: true,
	skipWaiting: true,
	sourcemap: false,
	maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
	runtimeCaching: [
		{
			urlPattern: ({ request }) => request.destination === 'font',
			handler: 'CacheFirst',
			options: {
				cacheName: 'fonts',
				expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
				cacheableResponse: { statuses: [0, 200] }
			}
		}
	]
})

for (const warning of warnings) {
	console.warn(warning)
}

console.log(`sw.js precaches ${String(count)} files, ${String(Math.round(size / 1024))} kB`)
