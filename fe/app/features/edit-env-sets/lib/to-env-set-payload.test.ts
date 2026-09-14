import { describe, expect, it } from 'vitest'

import { toEnvSetPayload } from './to-env-set-payload'

describe('toEnvSetPayload', () => {
	it('keeps a stored value left empty and replaces one that was typed', () => {
		const payload = toEnvSetPayload({
			path: ' be ',
			pairs: [
				{ id: '1', key: 'DATABASE_URL', value: '', stored: true },
				{ id: '2', key: 'SUPABASE_KEY', value: 'next', stored: true }
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
			pairs: [{ id: '1', key: 'EMPTY', value: '', stored: false }]
		})

		expect(payload.vars).toEqual([{ key: 'EMPTY', value: '' }])
	})
})
