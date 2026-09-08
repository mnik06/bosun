import { Button } from '@mantine/core'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useDeletePlan } from '~/features/delete-plan/api/use-delete-plan'
import { confirmPlanDeletion } from '~/features/delete-plan/ui/confirm-plan-deletion'

export function DeletePlanButton ({ planId }: { planId: string }) {
	const navigate = useNavigate()
	const remove = useDeletePlan()

	return (
		<Button
			variant="subtle"
			color="red"
			size="compact-sm"
			leftSection={<Trash2 size={14} />}
			loading={remove.isPending}
			onClick={() => {
				confirmPlanDeletion({
					title: 'Delete this plan?',
					onConfirm: () => {
						remove.mutate(planId, {
							onSuccess: () => {
								void navigate('/plans')
							}
						})
					}
				})
			}}
		>
			Delete
		</Button>
	)
}
