import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['app/**/*.test.ts'],
		environment: 'node',
		passWithNoTests: true
	},
	resolve: {
		alias: {
			'~': fileURLToPath(new URL('./app', import.meta.url))
		}
	}
})
