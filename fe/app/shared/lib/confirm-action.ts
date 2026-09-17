import { modals } from '@mantine/modals'
import type { ReactNode } from 'react'

export function confirmAction (opts: {
	title: string
	body: ReactNode
	confirmLabel: string
	cancelLabel?: string
	color: string
	onConfirm: () => void
}): void {
	modals.openConfirmModal({
		title: opts.title,
		centered: true,
		children: opts.body,
		labels: { confirm: opts.confirmLabel, cancel: opts.cancelLabel ?? 'Cancel' },
		confirmProps: { color: opts.color },
		onConfirm: opts.onConfirm
	})
}
