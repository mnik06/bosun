import { describe, expect, it } from 'vitest'

import { itemElapsedMs, queueElapsedMs } from './elapsed'
import type { QueueItemDetail } from '~/entities/queue/model/queue'

const NOW = new Date('2026-01-01T12:00:00Z').getTime()

function item (opts: { startedAt: string | null, finishedAt?: string }): QueueItemDetail {
	return {
		startedAt: opts.startedAt === null ? null : new Date(opts.startedAt),
		finishedAt: opts.finishedAt === undefined ? null : new Date(opts.finishedAt)
	} as QueueItemDetail
}

describe('itemElapsedMs', () => {
	it('is null before a plan starts', () => {
		expect(itemElapsedMs({ item: item({ startedAt: null }), now: NOW })).toBeNull()
	})

	it('measures a running plan to now', () => {
		expect(itemElapsedMs({ item: item({ startedAt: '2026-01-01T11:58:00Z' }), now: NOW })).toBe(
			120_000
		)
	})

	it('stops at the finish once a plan is over', () => {
		const finished = item({
			startedAt: '2026-01-01T11:00:00Z',
			finishedAt: '2026-01-01T11:30:00Z'
		})

		expect(itemElapsedMs({ item: finished, now: NOW })).toBe(1_800_000)
	})
})

describe('queueElapsedMs', () => {
	// The gap between the two plans is not counted: a queue waiting for work was
	// not working.
	it('sums what its plans spent, not the span they cover', () => {
		const items = [
			item({ startedAt: '2026-01-01T09:00:00Z', finishedAt: '2026-01-01T09:10:00Z' }),
			item({ startedAt: '2026-01-01T11:55:00Z' }),
			item({ startedAt: null })
		]

		expect(queueElapsedMs({ items, now: NOW })).toBe(600_000 + 300_000)
	})
})
