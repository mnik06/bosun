import { Badge, Loader, Tooltip } from '@mantine/core'

import { PLAN_STATE_LABEL, resolvePlanState, WORKING_STATES } from '~/entities/plan/lib/plan-state'
import type { Plan } from '~/entities/plan/model/plan'

export function PlanStatusBadge ({ plan }: { plan: Plan }) {
	const state = resolvePlanState(plan)
	const { label, color } = PLAN_STATE_LABEL[state]

	const badge = (
		<Badge
			color={color}
			variant="light"
			leftSection={WORKING_STATES.includes(state) ? <Loader size={10} color={color} /> : null}
		>
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
