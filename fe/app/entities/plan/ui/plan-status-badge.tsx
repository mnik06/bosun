import { Badge, Tooltip } from '@mantine/core'

import type { Plan, PlanStatus } from '~/entities/plan/model/plan'

const statusColor: Record<PlanStatus, string> = {
	planning: 'blue',
	ready: 'green',
	failed: 'red'
}

export function PlanStatusBadge ({ plan }: { plan: Plan }) {
	const badge = (
		<Badge color={statusColor[plan.status]} variant="light">
			{plan.status}
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
