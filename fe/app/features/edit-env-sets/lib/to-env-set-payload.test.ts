import { describe, expect, it } from 'vitest'

import { toEnvSetPayload } from './to-env-set-payload'

describe('toEnvSetPayload', () => {
	it('keeps a stored value left empty and replaces one that was typed', () => {
		const payload = toEnvSetPayload({
			path: ' be ',
			pairs: [
				{ id: '1', key: 'DATABASE_URL', value: '', stored: true, required: false },
				{ id: '2', key: 'SUPABASE_KEY', value: 'next', stored: true, required: false }
			]
		})

		expect(payload).toEqual({
			path: 'be',
			vars: [
				{ key: 'DATABASE_URL', value: null },
				{ key: 'SUPABASE_KEY', value: 'next' }
			]
		})
	})

	it('sends a new key exactly as typed, empty included', () => {
		const payload = toEnvSetPayload({
			path: '/be',
			pairs: [{ id: '1', key: 'EMPTY', value: '', stored: false, required: false }]
		})

		expect(payload.vars).toEqual([{ key: 'EMPTY', value: '' }])
	})

	it('leaves out a required key nobody typed, but keeps a stored one', () => {
		const payload = toEnvSetPayload({
			path: 'be',
			pairs: [
				{ id: '1', key: 'SUPABASE_URL', value: '', stored: false, required: true },
				{ id: '2', key: 'DATABASE_URL', value: '', stored: true, required: true },
				{ id: '3', key: 'SENTRY_DSN', value: 'https://sentry', stored: false, required: true }
			]
		})

		expect(payload.vars).toEqual([
			{ key: 'DATABASE_URL', value: null },
			{ key: 'SENTRY_DSN', value: 'https://sentry' }
		])
	})
})
