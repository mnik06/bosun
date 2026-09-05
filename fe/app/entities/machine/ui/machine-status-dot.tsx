import { Box, Tooltip } from '@mantine/core'

import type { MachineStatus } from '~/entities/machine/model/machine'

const statusColor: Record<MachineStatus, string> = {
	pending: 'gray.5',
	online: 'green.6',
	offline: 'red.6'
}

export function MachineStatusDot ({ status }: { status: MachineStatus }) {
	return (
		<Tooltip label={status}>
			<Box
				bg={statusColor[status]}
				className="size-2.5 shrink-0 rounded-full"
				aria-label={`status: ${status}`}
			/>
		</Tooltip>
	)
}
