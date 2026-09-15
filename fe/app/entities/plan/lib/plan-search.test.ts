import { describe, expect, it } from 'vitest'

import { matchesPlanSearch, sortPlansByRecency } from '~/entities/plan/lib/plan-search'
import type { PlanListEntry } from '~/entities/plan/model/plan'

function entry (overrides: Omit<Partial<PlanListEntry>, 'build'> & { build?: Partial<NonNullable<PlanListEntry['build']>> | null }): PlanListEntry {
	return { number: 1, title: 'Add list view toggle', createdAt: '2026-01-01T00:00:00.000Z', build: null, ...overrides } as unknown as PlanListEntry
}

describe('matchesPlanSearch', () => {
	it('matches everything when the query is empty', () => {
		expect(matchesPlanSearch(entry({}), '')).toBe(true)
		expect(matchesPlanSearch(entry({}), '   ')).toBe(true)
	})

	it('strips a leading # before matching the number', () => {
		expect(matchesPlanSearch(entry({ number: 42 }), '#42')).toBe(true)
	})

	it('matches the number by prefix', () => {
		expect(matchesPlanSearch(entry({ number: 123 }), '12')).toBe(true)
		expect(matchesPlanSearch(entry({ number: 123 }), '23')).toBe(false)
	})

	it('matches the title by substring, case-insensitively', () => {
		expect(matchesPlanSearch(entry({ title: 'Add List View Toggle' }), 'list view')).toBe(true)
	})

	it('treats a nullish title as no match', () => {
		expect(matchesPlanSearch(entry({ number: 1, title: null }), 'view')).toBe(false)
	})

	it('returns false when neither the number nor the title match', () => {
		expect(matchesPlanSearch(entry({ number: 1, title: 'Add list view toggle' }), 'nope')).toBe(false)
	})
})

describe('sortPlansByRecency', () => {
	it('orders by build.finishedAt when it is set', () => {
		const older = entry({ number: 1, build: { finishedAt: '2026-01-01T00:00:00.000Z' } })
		const newer = entry({ number: 2, build: { finishedAt: '2026-02-01T00:00:00.000Z' } })

		expect(sortPlansByRecency([older, newer])).toEqual([newer, older])
	})

	it('falls back to createdAt when the build has no finishedAt', () => {
		const older = entry({ number: 1, createdAt: '2026-01-01T00:00:00.000Z', build: { finishedAt: null } })
		const newer = entry({ number: 2, createdAt: '2026-02-01T00:00:00.000Z', build: { finishedAt: null } })

		expect(sortPlansByRecency([older, newer])).toEqual([newer, older])
	})

	it('falls back to createdAt when there is no build at all', () => {
		const older = entry({ number: 1, createdAt: '2026-01-01T00:00:00.000Z', build: null })
		const newer = entry({ number: 2, createdAt: '2026-02-01T00:00:00.000Z', build: null })

		expect(sortPlansByRecency([older, newer])).toEqual([newer, older])
	})
})
