import { Text } from '@mantine/core'

import { confirmAction } from '~/shared/lib'

export function confirmPlanDeletion (opts: { title: string, onConfirm: () => void }) {
	confirmAction({
		title: opts.title,
		body: (
			<Text size="sm">
				The transcript, the acceptance criteria and the tracer bullets go with it, and any session
				running on the machine is killed. This cannot be undone.
			</Text>
		),
		confirmLabel: 'Delete',
		cancelLabel: 'Keep it',
		color: 'red',
		onConfirm: opts.onConfirm
	})
}
