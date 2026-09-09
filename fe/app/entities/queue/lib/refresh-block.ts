import type { Queue } from '~/entities/queue/model/queue'

// `blocked` counts as busy: the queue is waiting on an answer, but the session
// holding the question is still alive and would die with the restart.
const BUSY: Queue['status'][] = ['running', 'blocked']

// A refresh is also how an agent upgrade is offered, and the agent refuses to
// swap its own binary while a session is running — it would restart out from
// under a bullet mid-flight. The refusal is right; making the button look
// available while it holds is what confused everybody.
export function queueRefreshBlock (queues: Queue[] | undefined): string | null {
	const busy = (queues ?? []).filter((queue) => BUSY.includes(queue.status))

	const [first] = busy

	if (first === undefined) {
		return null
	}

	const what = busy.length === 1 ? `${first.name} is` : `${busy.length} queues are`

	return `${what} still running. Pause first — the agent will not restart while a bullet is in flight.`
}
