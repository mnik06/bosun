import { describe, expect, it } from 'vitest'

import { boardColumn } from '~/entities/plan/lib/board-column'

const progress = (bulletsDone: number) => ({ bulletsDone, bulletsTotal: 3, needsYouReason: null })

describe('boardColumn', () => {
	it.each([
		['drafting', 'drafting'],
		['needs_approval', 'needs_approval'],
		['scheduled', 'scheduled'],
		['held', 'scheduled'],
		['building', 'building'],
		['integrating', 'syncing'],
		['verifying', 'verifying'],
		['in_review', 'in_review']
	] as const)('puts %s in %s', (state, column) => {
		expect(boardColumn({ state, build: progress(1) })).toBe(column)
	})

	it.each(['merged', 'cancelled'] as const)('leaves %s off the board', (state) => {
		expect(boardColumn({ state, build: progress(3) })).toBeNull()
	})

	// A stopped plan stays where its work stopped, so the board still says how far
	// it got rather than collecting every stop in one pile.
	it.each([
		[0, 'scheduled'],
		[2, 'building'],
		[3, 'verifying']
	] as const)('places a plan that needs you with %i bullets done in %s', (done, column) => {
		expect(boardColumn({ state: 'needs_you', build: progress(done) })).toBe(column)
		expect(boardColumn({ state: 'failed', build: progress(done) })).toBe(column)
	})

	it('keeps a grill that failed with the drafts', () => {
		expect(boardColumn({ state: 'failed', build: null })).toBe('drafting')
	})

	it('puts an overlap decision made before any build in scheduled', () => {
		expect(boardColumn({ state: 'needs_you', build: null })).toBe('scheduled')
	})

	// A failed sync leaves every bullet done, so without this check the bullet-count
	// fallback below would silently drop it into Verifying.
	it.each(['needs_you', 'failed'] as const)('routes a %s build stopped on a failed sync to syncing', (state) => {
		expect(boardColumn({ state, build: { bulletsDone: 3, bulletsTotal: 3, needsYouReason: 'integration' } })).toBe('syncing')
	})

	it('routes a sync failure to syncing even before any bullet lands', () => {
		expect(boardColumn({ state: 'needs_you', build: { bulletsDone: 0, bulletsTotal: 3, needsYouReason: 'integration' } })).toBe('syncing')
	})
})
