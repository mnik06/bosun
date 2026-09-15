import { ActionIcon, Stack, Text, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Trash2 } from 'lucide-react'

import type { Project } from '~/entities/project'
import { useDeleteProject } from '~/features/delete-project/api/use-delete-project'

export function DeleteProjectButton ({ project }: { project: Project }) {
	const deleteProject = useDeleteProject(project.id)

	const confirm = () => {
		modals.openConfirmModal({
			title: `Delete ${project.name}?`,
			centered: true,
			labels: { confirm: 'Delete project', cancel: 'Cancel' },
			confirmProps: { color: 'red' },
			children: (
				<Stack gap="sm">
					<Text size="sm">
						Its machines, plans and queues are deleted with it, and its members lose access
						immediately.
					</Text>
					<Text size="sm" fw={600}>
						This cannot be undone.
					</Text>
				</Stack>
			),
			onConfirm: () => {
				deleteProject.mutate()
			}
		})
	}

	return (
		<Tooltip label="Delete project">
			<ActionIcon
				variant="subtle"
				color="red"
				loading={deleteProject.isPending}
				onClick={confirm}
			>
				<Trash2 size={16} />
			</ActionIcon>
		</Tooltip>
	)
}
