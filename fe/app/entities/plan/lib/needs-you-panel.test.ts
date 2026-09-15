import { describe, expect, it } from 'vitest'

import { showsNeedsYouPanel } from './needs-you-panel'

describe('showsNeedsYouPanel', () => {
	it('owns a stopped build with a reason', () => {
		expect(showsNeedsYouPanel({ status: 'needs_you', needsYouReason: 'integration' })).toBe(true)
		expect(showsNeedsYouPanel({ status: 'needs_you', needsYouReason: 'checks' })).toBe(true)
	})

	it('leaves an overlap to its decision panel', () => {
		expect(showsNeedsYouPanel({ status: 'needs_you', needsYouReason: 'overlap' })).toBe(false)
	})

	it('leaves a stop with no reason, and every other status, to the page', () => {
		expect(showsNeedsYouPanel({ status: 'needs_you', needsYouReason: null })).toBe(false)
		expect(showsNeedsYouPanel({ status: 'failed', needsYouReason: null })).toBe(false)
		expect(showsNeedsYouPanel({ status: 'held', needsYouReason: null })).toBe(false)
		expect(showsNeedsYouPanel(null)).toBe(false)
	})
})
