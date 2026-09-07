import { Button } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Text } from '@mantine/core'
import { useNavigate } from 'react-router'

import { useDiscardPlan } from '~/features/discard-plan/api/use-discard-plan'

export function DiscardPlanButton ({ planId }: { planId: string }) {
	const navigate = useNavigate()
	const discard = useDiscardPlan()

	return (
		<Button
			variant="subtle"
			color="red"
			loading={discard.isPending}
			onClick={() => {
				modals.openConfirmModal({
					title: 'Discard this plan?',
					children: (
						<Text size="sm">
							The transcript, the acceptance criteria and the tracer bullets go with it, and the
							session running on the machine is killed. This cannot be undone.
						</Text>
					),
					labels: { confirm: 'Discard', cancel: 'Keep it' },
					confirmProps: { color: 'red' },
					onConfirm: () => {
						discard.mutate(planId, {
							onSuccess: () => {
								void navigate('/plans')
							}
						})
					}
				})
			}}
		>
			Discard
		</Button>
	)
}
