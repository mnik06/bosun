import { Badge, Group, Loader } from '@mantine/core'

import type { QueueStatus } from '~/entities/queue/model/queue'

const COLORS: Record<QueueStatus, string> = {
	provisioning: 'gray',
	idle: 'blue',
	running: 'green',
	paused: 'yellow',
	blocked: 'orange',
	stopped: 'gray',
	failed: 'red'
}

export function QueueStatusBadge ({ status }: { status: QueueStatus }) {
	return (
		<Badge color={COLORS[status]} variant="light" size="sm">
			<Group gap={6} align="center" wrap="nowrap">
				{status === 'provisioning' || status === 'running' ? <Loader size={10} color={COLORS[status]} /> : null}
				{status}
			</Group>
		</Badge>
	)
}
