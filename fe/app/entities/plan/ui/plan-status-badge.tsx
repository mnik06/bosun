import { Badge, Tooltip } from '@mantine/core'

import type { Plan, PlanState, PlanStatus } from '~/entities/plan/model/plan'

const STATE_LABEL: Record<PlanState, { label: string, color: string }> = {
	planning: { label: 'planning', color: 'blue' },
	drafted: { label: 'drafted', color: 'grape' },
	confirmed: { label: 'confirmed', color: 'teal' },
	queued: { label: 'queued', color: 'gray' },
	running: { label: 'running', color: 'blue' },
	in_review: { label: 'in review', color: 'green' },
	failed: { label: 'failed', color: 'red' }
}

// Only reached against a backend that has not shipped the derived state yet, so
// it says the little the plan row alone can support rather than guessing at a run.
function fallbackState (opts: { status: PlanStatus, confirmedAt: string | null }): PlanState {
	if (opts.status === 'failed') {
		return 'failed'
	}

	if (opts.status === 'planning') {
		return 'planning'
	}

	return opts.confirmedAt === null ? 'drafted' : 'confirmed'
}

export function PlanStatusBadge ({ plan }: { plan: Plan }) {
	const state = plan.state ?? fallbackState({ status: plan.status, confirmedAt: plan.confirmedAt })
	const { label, color } = STATE_LABEL[state]

	const badge = (
		<Badge color={color} variant="light">
			{label}
		</Badge>
	)

	return plan.failureReason === null ? (
		badge
	) : (
		<Tooltip label={plan.failureReason} multiline w={280}>
			{badge}
		</Tooltip>
	)
}
