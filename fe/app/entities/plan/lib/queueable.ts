import type { Plan } from '~/entities/plan/model/plan'

// Mirrors what the API enforces, so the checkbox does not offer something the
// push is going to refuse. A finished plan stays selectable — pushing that again
// is a re-run, which is legitimate — but one already waiting or running is not:
// two queues are two worktrees, two branches and two pull requests for one piece
// of work.
export function planQueueRefusal (plan: Plan): string | null {
	if (plan.status !== 'ready' || plan.confirmedAt === null) {
		return 'Only a confirmed, finished plan can be queued'
	}

	if (plan.state === 'running') {
		return 'Already running in a queue'
	}

	return plan.state === 'queued' ? 'Already waiting in a queue' : null
}
