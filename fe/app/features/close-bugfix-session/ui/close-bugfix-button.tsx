import { Button } from '@mantine/core'
import { CheckCheck } from 'lucide-react'

import { useCloseBugfixSession } from '~/features/close-bugfix-session/api/use-close-bugfix-session'
import { confirmAction } from '~/shared/lib'

export function CloseBugfixButton ({ planId }: { planId: string }) {
	const mutation = useCloseBugfixSession(planId)

	return (
		<Button
			size="compact-sm"
			variant="light"
			color="teal"
			leftSection={<CheckCheck size={14} />}
			loading={mutation.isPending}
			onClick={() => {
				confirmAction({
					title: 'Done fixing bugs?',
					body:
						'The session ends. Anything still pending or in progress is left as it is — mention it again in a new message to pick it back up.',
					confirmLabel: 'Mark done',
					cancelLabel: 'Keep going',
					color: 'teal',
					onConfirm: () => {
						mutation.mutate()
					}
				})
			}}
		>
			Mark done
		</Button>
	)
}
