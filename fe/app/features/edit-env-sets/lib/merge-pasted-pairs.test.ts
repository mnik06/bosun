import { describe, expect, it } from 'vitest'

import { mergePastedPairs } from './merge-pasted-pairs'

let next = 0
const newId = () => `new-${++next}`

describe('mergePastedPairs', () => {
	it('replaces the value of a key the machine stores instead of adding it twice', () => {
		const merged = mergePastedPairs({
			pairs: [{ id: '1', key: 'DATABASE_URL', value: '', stored: true, required: false }],
			vars: [{ key: 'DATABASE_URL', value: 'postgres://next' }, { key: 'TZ', value: 'UTC' }],
			newId
		})

		expect(merged.map(({ key, value, stored }) => ({ key, value, stored }))).toEqual([
			{ key: 'DATABASE_URL', value: 'postgres://next', stored: true },
			{ key: 'TZ', value: 'UTC', stored: false }
		])
		expect(merged[0]?.id).toBe('1')
	})

	it('drops the blank pair a new set opens with', () => {
		const merged = mergePastedPairs({
			pairs: [{ id: '1', key: '', value: '', stored: false, required: false }],
			vars: [{ key: 'PORT', value: '1306' }],
			newId
		})

		expect(merged.map((pair) => pair.key)).toEqual(['PORT'])
	})
})
