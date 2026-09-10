import { type QueueItemStatus } from 'src/types/QueueSchema';

// A blocker holds a plan back when it is queued **somewhere in the project** and
// has not landed. Widened from "queued in this queue" because a preparation plan
// is deliberately pushed to a different queue from the plans waiting on it, and
// the whole point of preparing them is that the gate holds across queues.
//
// A blocker queued nowhere still holds nothing back. That is what keeps the old
// protection: nothing would ever complete a dependency nobody pushed, so waiting
// on one stalls a queue for good, and running in push order and letting the
// result show it is the lesser failure.
//
// `failed` and `cancelled` count as nowhere for the same reason — neither is
// going to finish on its own, and a retry puts the item back to `queued`, which
// closes the gate again.
export function blockerHolds(statuses: QueueItemStatus[] | undefined): boolean {
	if (!statuses || statuses.includes('done')) {
		return false;
	}

	return statuses.some((status) => status === 'queued' || status === 'running');
}
