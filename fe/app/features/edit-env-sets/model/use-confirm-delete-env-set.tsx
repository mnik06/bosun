import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'

import { useDeleteEnvSet } from '~/features/edit-env-sets/api/use-delete-env-set'
import { envFilePath } from '~/features/edit-env-sets/lib/env-file-path'

export function useConfirmDeleteEnvSet (machineId: string) {
	const deleteEnvSet = useDeleteEnvSet(machineId)

	const confirm = (path: string) => {
		const file = envFilePath(path)

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
				deleteEnvSet.mutate(path)
			}
		})
	}

	return { confirm, isPending: deleteEnvSet.isPending }
}
