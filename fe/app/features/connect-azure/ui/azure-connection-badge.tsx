import { Badge, Group } from '@mantine/core'
import { useState } from 'react'

import type { AzureConnection } from '~/entities/repository'
import { DisconnectAzureMenuItem } from '~/features/connect-azure/ui/disconnect-azure-menu-item'
import { RotateAzureModal } from '~/features/connect-azure/ui/rotate-azure-modal'
import { ConnectionActionsMenu } from '~/shared/ui'

export function AzureConnectionBadge ({ connection }: { connection: AzureConnection }) {
	const [rotating, setRotating] = useState(false)
	const broken = connection.status === 'broken'

	return (
		<Group gap={4} wrap="nowrap">
			<Badge {...(broken ? { color: 'red' } : {})} variant={broken ? 'filled' : 'default'} tt="none">
				{connection.organization}
			</Badge>

			<ConnectionActionsMenu
				ariaLabel={`${connection.organization} actions`}
				onRotate={() => { setRotating(true) }}
				disconnectItem={<DisconnectAzureMenuItem connection={connection} />}
			/>

			<RotateAzureModal connection={connection} opened={rotating} onClose={() => { setRotating(false) }} />
		</Group>
	)
}
