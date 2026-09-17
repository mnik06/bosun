import { Text } from '@mantine/core'

import { useDeleteEnvSet } from '~/features/edit-env-sets/api/use-delete-env-set'
import { envFilePath } from '~/features/edit-env-sets/lib/env-file-path'
import { confirmAction } from '~/shared/lib'

export function useConfirmDeleteEnvSet (machineId: string) {
	const deleteEnvSet = useDeleteEnvSet(machineId)

	const confirm = (path: string) => {
		const file = envFilePath(path)

		confirmAction({
			title: `Delete ${file}?`,
			confirmLabel: 'Delete',
			color: 'red',
			body: (
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
