import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Pencil, Trash2 } from 'lucide-react'

import type { EnvSetSummary } from '~/entities/machine'
import { useDeleteEnvSet } from '~/features/edit-env-sets/api/use-delete-env-set'
import { envFilePath } from '~/features/edit-env-sets/lib/env-file-path'
import { formatRelativeTime } from '~/shared/lib'

export function EnvSetRow ({
	machineId,
	envSet,
	onEdit
}: {
	machineId: string,
	envSet: EnvSetSummary,
	onEdit: () => void
}) {
	const deleteEnvSet = useDeleteEnvSet(machineId)
	const file = envFilePath(envSet.path)

	const confirm = () => {
		modals.openConfirmModal({
			title: `Delete ${file}?`,
			centered: true,
			labels: { confirm: 'Delete', cancel: 'Cancel' },
			confirmProps: { color: 'red' },
			children: (
				<Text size="sm">
					bosun stops writing {file} before each bullet and the machine forgets these values. They
					cannot be read back, so adding the set again means typing every value again.
				</Text>
			),
			onConfirm: () => {
				deleteEnvSet.mutate(envSet.path)
			}
		})
	}

	return (
		<Paper withBorder radius="sm" p="xs">
			<Group justify="space-between" align="start" gap="sm" wrap="nowrap">
				<Stack gap={6} className="min-w-0">
					<Group gap="xs">
						<Text size="sm" className="font-mono break-all">
							{file}
						</Text>
						<Text size="xs" c="dimmed">
							updated {formatRelativeTime(envSet.updatedAt)}
						</Text>
					</Group>

					<Group gap={4}>
						{envSet.keys.map((key) => (
							<Badge key={key} size="sm" variant="default" radius="sm" tt="none" className="font-mono">
								{key}
							</Badge>
						))}
					</Group>
				</Stack>

				<Group gap={4} wrap="nowrap" className="shrink-0">
					<Tooltip label="Edit">
						<ActionIcon variant="subtle" color="gray" aria-label={`Edit ${file}`} onClick={onEdit}>
							<Pencil size={16} />
						</ActionIcon>
					</Tooltip>
					<Tooltip label="Delete">
						<ActionIcon
							variant="subtle"
							color="red"
							aria-label={`Delete ${file}`}
							loading={deleteEnvSet.isPending}
							onClick={confirm}
						>
							<Trash2 size={16} />
						</ActionIcon>
					</Tooltip>
				</Group>
			</Group>
		</Paper>
	)
}
