import { ActionIcon } from '@mantine/core'
import { Trash2 } from 'lucide-react'

import { useDeletePlan } from '~/features/delete-plan/api/use-delete-plan'
import { confirmPlanDeletion } from '~/features/delete-plan/ui/confirm-plan-deletion'

// The list variant: same confirmation, no navigation, and it stops the click
// reaching the card underneath — which is a link to the plan being deleted.
export function DeletePlanAction ({ planId, title }: { planId: string, title: string }) {
	const remove = useDeletePlan()

	return (
		<ActionIcon
			variant="subtle"
			color="red"
			aria-label={`Delete ${title}`}
			loading={remove.isPending}
			onClick={(event) => {
				event.preventDefault()
				event.stopPropagation()
				confirmPlanDeletion({
					title: `Delete ${title}?`,
					onConfirm: () => {
						remove.mutate(planId)
					}
				})
			}}
		>
			<Trash2 size={16} />
		</ActionIcon>
	)
}
