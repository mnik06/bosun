import { ActionIcon, Button } from '@mantine/core'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useDeletePlan } from '~/features/delete-plan/api/use-delete-plan'
import { confirmPlanDeletion } from '~/features/delete-plan/ui/confirm-plan-deletion'

export function DeletePlanButton ({
	planId,
	iconOnly = false,
	className
}: {
	planId: string,
	iconOnly?: boolean,
	className?: string
}) {
	const navigate = useNavigate()
	const remove = useDeletePlan()

	const onClick = () => {
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
	}

	if (iconOnly) {
		return (
			<ActionIcon
				className={className}
				variant="light"
				color="red"
				size="sm"
				aria-label="Delete this plan"
				loading={remove.isPending}
				onClick={onClick}
			>
				<Trash2 size={16} />
			</ActionIcon>
		)
	}

	return (
		<Button
			className={className}
			variant="light"
			color="red"
			size="compact-sm"
			leftSection={<Trash2 size={14} />}
			loading={remove.isPending}
			onClick={onClick}
		>
			Delete
		</Button>
	)
}
