import { ActionIcon, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Trash2 } from 'lucide-react'

import { useDiscardPlan } from '~/features/discard-plan/api/use-discard-plan'

// The list variant: same confirmation, no navigation, and it stops the click
// reaching the card underneath — which is a link to the plan being deleted.
export function DiscardPlanAction ({ planId, title }: { planId: string, title: string }) {
	const discard = useDiscardPlan()

	return (
		<ActionIcon
			variant="subtle"
			color="red"
			aria-label={`Discard ${title}`}
			loading={discard.isPending}
			onClick={(event) => {
				event.preventDefault()
				event.stopPropagation()
				modals.openConfirmModal({
					title: `Discard ${title}?`,
					centered: true,
					children: (
						<Text size="sm">
							The transcript, the acceptance criteria and the tracer bullets go with it, and any
							session running on the machine is killed. This cannot be undone.
						</Text>
					),
					labels: { confirm: 'Discard', cancel: 'Keep it' },
					confirmProps: { color: 'red' },
					onConfirm: () => {
						discard.mutate(planId)
					}
				})
			}}
		>
			<Trash2 size={16} />
		</ActionIcon>
	)
}
