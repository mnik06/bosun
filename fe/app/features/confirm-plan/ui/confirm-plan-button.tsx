import { Badge, Button } from '@mantine/core'
import { Check } from 'lucide-react'

import type { Plan } from '~/entities/plan'
import { useConfirmPlan } from '~/features/confirm-plan/api/use-confirm-plan'

// Nothing is queued on a session's own say-so. `ready` means the session
// finished; this button is the person saying they have read what it wrote.
export function ConfirmPlanButton ({ plan }: { plan: Plan }) {
	const confirm = useConfirmPlan(plan.id)

	if (plan.confirmedAt !== null) {
		return (
			<Badge color="green" variant="light" leftSection={<Check size={12} />}>
				Confirmed
			</Badge>
		)
	}

	return (
		<Button
			size="compact-sm"
			leftSection={<Check size={14} />}
			loading={confirm.isPending}
			disabled={plan.status !== 'ready'}
			onClick={() => {
				confirm.mutate()
			}}
		>
			Confirm
		</Button>
	)
}
