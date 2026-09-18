import { notifications } from '@mantine/notifications'
import { useState } from 'react'

import { admitFiles, type FileLimits } from '~/shared/lib'

// Files picked, pasted or dropped onto a composer and not yet sent. With no
// limits given the composer takes no files at all, and whatever was picked
// before stays out of the next send rather than riding along unseen.
export function usePendingFiles (limits: FileLimits | undefined) {
	const [picked, setPicked] = useState<File[]>([])

	const add = (incoming: File[]): void => {
		if (!limits || incoming.length === 0) {
			return
		}

		const admitted = admitFiles({ current: picked, incoming, limits })

		setPicked(admitted.files)

		if (admitted.refused.length > 0) {
			notifications.show({
				color: 'red',
				title: 'Some files were not attached',
				message: admitted.refused.join('\n')
			})
		}
	}

	return {
		files: limits ? picked : [],
		add,
		remove: (index: number): void => {
			setPicked(picked.filter((_, position) => position !== index))
		},
		clear: (): void => {
			setPicked([])
		}
	}
}
