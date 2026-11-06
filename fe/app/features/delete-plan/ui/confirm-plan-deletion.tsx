import { Stack, Text } from '@mantine/core'

import { confirmAction } from '~/shared/lib'

export function confirmPlanDeletion (opts: { title: string, warning?: string | undefined, onConfirm: () => void }) {
	confirmAction({
		title: opts.title,
		body: (
			<Stack gap="xs">
				<Text size="sm">
					The transcript, the acceptance criteria and the tracer bullets go with it, and any session
					running on the machine is killed. This cannot be undone.
				</Text>
				{opts.warning !== undefined ? <Text size="sm">{opts.warning}</Text> : null}
			</Stack>
		),
		confirmLabel: 'Delete',
		cancelLabel: 'Keep it',
		color: 'red',
		onConfirm: opts.onConfirm
	})
}
