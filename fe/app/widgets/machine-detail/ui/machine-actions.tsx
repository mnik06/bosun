import { ActionIcon, Menu } from '@mantine/core'
import { EllipsisVertical, RefreshCw } from 'lucide-react'

import type { Machine } from '~/entities/machine'
import { useActiveProject } from '~/entities/project'
import { DeleteMenuItem } from '~/features/delete-machine'
import { PauseMenuItem } from '~/features/pause-machine'

export function MachineActions ({
	machine,
	onRefresh,
	isRefreshing
}: {
	machine: Machine,
	onRefresh: () => void,
	isRefreshing: boolean
}) {
	const { isLeader } = useActiveProject()

	// Every item behind this menu is a leader-only endpoint, so a developer gets no
	// menu rather than a menu of refusals.
	if (!isLeader) {
		return null
	}

	return (
		<Menu position="bottom-end" withinPortal>
			<Menu.Target>
				<ActionIcon variant="default" size="lg" aria-label="Machine actions">
					<EllipsisVertical size={16} />
				</ActionIcon>
			</Menu.Target>

			<Menu.Dropdown>
				<Menu.Item
					leftSection={<RefreshCw size={14} />}
					disabled={isRefreshing}
					onClick={onRefresh}
				>
					Refresh machine
				</Menu.Item>

				<PauseMenuItem machine={machine} />

				<Menu.Divider />

				<DeleteMenuItem machine={machine} />
			</Menu.Dropdown>
		</Menu>
	)
}
