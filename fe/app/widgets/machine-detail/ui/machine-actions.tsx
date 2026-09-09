import { ActionIcon, Menu, Tooltip } from '@mantine/core'
import { EllipsisVertical, RefreshCw } from 'lucide-react'

import type { Machine } from '~/entities/machine'
import { DeleteMenuItem } from '~/features/delete-machine'
import { PauseMenuItem } from '~/features/pause-machine'

export function MachineActions ({
	machine,
	onRefresh,
	isRefreshing,
	refreshBlockedBy
}: {
	machine: Machine,
	onRefresh: () => void,
	isRefreshing: boolean,
	refreshBlockedBy?: string | null
}) {
	return (
		<Menu position="bottom-end" withinPortal>
			<Menu.Target>
				<ActionIcon variant="default" size="lg" aria-label="Machine actions">
					<EllipsisVertical size={16} />
				</ActionIcon>
			</Menu.Target>

			<Menu.Dropdown>
				<Tooltip label={refreshBlockedBy ?? ''} disabled={refreshBlockedBy == null} multiline w={240}>
					<Menu.Item
						leftSection={<RefreshCw size={14} />}
						disabled={isRefreshing || refreshBlockedBy != null}
						onClick={onRefresh}
					>
						Refresh machine
					</Menu.Item>
				</Tooltip>

				<PauseMenuItem machine={machine} />

				<Menu.Divider />

				<DeleteMenuItem machine={machine} />
			</Menu.Dropdown>
		</Menu>
	)
}
