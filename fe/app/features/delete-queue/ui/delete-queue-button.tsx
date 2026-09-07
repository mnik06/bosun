import { ActionIcon, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Trash2 } from 'lucide-react'

import type { Queue } from '~/entities/queue'
import { useDeleteQueue } from '~/features/delete-queue/api/use-delete-queue'

export function DeleteQueueButton ({ queue }: { queue: Queue }) {
	const deleteQueue = useDeleteQueue({ queueId: queue.id, machineId: queue.machineId })

	// The worktree goes with it, uncommitted changes included — a queue is deleted
	// to be rid of it, so the dialog says that rather than the removal quietly
	// refusing on a dirty tree and leaving a directory bosun has forgotten.
	const confirm = () => {
		modals.openConfirmModal({
			title: `Delete ${queue.name}?`,
			centered: true,
			labels: { confirm: 'Delete queue', cancel: 'Cancel' },
			confirmProps: { color: 'red' },
			children: (
				<Stack gap="sm">
					<Text size="sm">
						Its worktree on the machine is removed, along with anything uncommitted in it.
					</Text>
					<Text size="sm">Commits already made on its branches are left alone.</Text>
				</Stack>
			),
			onConfirm: () => {
				deleteQueue.mutate()
			}
		})
	}

	return (
		<ActionIcon
			variant="subtle"
			color="red"
			aria-label={`Delete ${queue.name}`}
			loading={deleteQueue.isPending}
			onClick={confirm}
		>
			<Trash2 size={16} />
		</ActionIcon>
	)
}
