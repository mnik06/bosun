import { ActionIcon, Badge, Group, Menu } from '@mantine/core'
import { EllipsisVertical, KeyRound } from 'lucide-react'
import { useState } from 'react'

import type { AzureConnection } from '~/entities/repository'
import { DisconnectAzureMenuItem } from '~/features/connect-azure/ui/disconnect-azure-menu-item'
import { RotateAzureModal } from '~/features/connect-azure/ui/rotate-azure-modal'

export function AzureConnectionBadge ({ connection }: { connection: AzureConnection }) {
	const [rotating, setRotating] = useState(false)
	const broken = connection.status === 'broken'

	return (
		<Group gap={4} wrap="nowrap">
			<Badge {...(broken ? { color: 'red' } : {})} variant={broken ? 'filled' : 'default'} tt="none">
				{connection.organization}
			</Badge>

			<Menu position="bottom-end" withinPortal>
				<Menu.Target>
					<ActionIcon variant="subtle" color="gray" size="sm" aria-label={`${connection.organization} actions`}>
						<EllipsisVertical size={12} />
					</ActionIcon>
				</Menu.Target>

				<Menu.Dropdown>
					<Menu.Item leftSection={<KeyRound size={14} />} onClick={() => { setRotating(true) }}>
						Replace token
					</Menu.Item>

					<Menu.Divider />

					<DisconnectAzureMenuItem connection={connection} />
				</Menu.Dropdown>
			</Menu>

			<RotateAzureModal connection={connection} opened={rotating} onClose={() => { setRotating(false) }} />
		</Group>
	)
}
