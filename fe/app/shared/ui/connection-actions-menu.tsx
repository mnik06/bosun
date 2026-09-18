import { ActionIcon, Menu } from '@mantine/core'
import { EllipsisVertical, KeyRound } from 'lucide-react'
import type { ReactNode } from 'react'

export function ConnectionActionsMenu ({ ariaLabel, onRotate, disconnectItem }: { ariaLabel: string, onRotate: () => void, disconnectItem: ReactNode }) {
	return (
		<Menu position="bottom-end" withinPortal>
			<Menu.Target>
				<ActionIcon variant="subtle" color="gray" size="sm" aria-label={ariaLabel}>
					<EllipsisVertical size={12} />
				</ActionIcon>
			</Menu.Target>

			<Menu.Dropdown>
				<Menu.Item leftSection={<KeyRound size={14} />} onClick={onRotate}>
					Replace token
				</Menu.Item>

				<Menu.Divider />

				{disconnectItem}
			</Menu.Dropdown>
		</Menu>
	)
}
