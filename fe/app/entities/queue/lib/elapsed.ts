import type { QueueItemDetail } from '~/entities/queue/model/queue'

// A plan that has not started has no elapsed time — not zero, which would read
// as "ran instantly". One still running is measured to now; one that finished is
// measured to when it did, so the number stops moving the moment it is over.
export function itemElapsedMs (opts: { item: QueueItemDetail, now: number }): number | null {
	if (opts.item.startedAt === null) {
		return null
	}

	const finished = opts.item.finishedAt?.getTime() ?? opts.now

	return Math.max(0, finished - opts.item.startedAt.getTime())
}

// The queue's total is the sum of its plans, not the wall clock from the first
// start to now: a queue paused overnight, or idle waiting for plans, did not
// spend that time working, and counting it would make every number meaningless
// by morning.
export function queueElapsedMs (opts: { items: QueueItemDetail[], now: number }): number {
	return opts.items.reduce(
		(total, item) => total + (itemElapsedMs({ item, now: opts.now }) ?? 0),
		0
	)
}
