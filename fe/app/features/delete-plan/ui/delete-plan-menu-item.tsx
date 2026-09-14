import { Menu } from '@mantine/core'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useDeletePlan } from '~/features/delete-plan/api/use-delete-plan'
import { confirmPlanDeletion } from '~/features/delete-plan/ui/confirm-plan-deletion'

export function DeletePlanMenuItem ({ planId }: { planId: string }) {
	const navigate = useNavigate()
	const remove = useDeletePlan()

	return (
		<Menu.Item
			color="red"
			leftSection={<Trash2 size={14} />}
			disabled={remove.isPending}
			onClick={() => {
				confirmPlanDeletion({
					title: 'Discard this plan?',
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
			Discard
		</Menu.Item>
	)
}
