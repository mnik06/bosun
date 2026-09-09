import { describe, expect, it } from 'vitest'

import { formatDuration } from './format-duration'

describe('formatDuration', () => {
	it.each([
		[0, '0s'],
		[999, '0s'],
		[1_000, '1s'],
		[59_000, '59s'],
		[60_000, '1m 0s'],
		[78 * 60_000 + 30_000, '1h 18m'],
		[3_600_000, '1h 0m'],
		[26 * 3_600_000, '26h 0m']
	])('%i ms -> %s', (ms, expected) => {
		expect(formatDuration(ms)).toBe(expected)
	})
})
