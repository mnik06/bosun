import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'

export function confirmPlanDeletion (opts: { title: string, onConfirm: () => void }) {
	modals.openConfirmModal({
		title: opts.title,
		centered: true,
		children: (
			<Text size="sm">
				The transcript, the acceptance criteria and the tracer bullets go with it, and any session
				running on the machine is killed. This cannot be undone.
			</Text>
		),
		labels: { confirm: 'Delete', cancel: 'Keep it' },
		confirmProps: { color: 'red' },
		onConfirm: opts.onConfirm
	})
}
