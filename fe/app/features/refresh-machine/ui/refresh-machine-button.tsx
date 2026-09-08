import { ActionIcon, Tooltip } from '@mantine/core'
import { RefreshCw } from 'lucide-react'

export function RefreshMachineButton ({
	onRefresh,
	isRefreshing
}: {
	onRefresh: () => void,
	isRefreshing: boolean
}) {
	return (
		<Tooltip label="Refresh the machine">
			<ActionIcon
				variant="filled"
				aria-label="Refresh machine"
				loading={isRefreshing}
				onClick={onRefresh}
			>
				<RefreshCw size={16} />
			</ActionIcon>
		</Tooltip>
	)
}
