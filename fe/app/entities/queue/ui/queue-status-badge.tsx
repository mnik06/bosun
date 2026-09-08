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

// A pause lands between bullets, so a queue can be `paused` with a session still
// finishing the bullet it holds. Saying `paused` next to a spinning bullet reads
// as a stuck queue, so the badge says which of the two it is.
export function QueueStatusBadge ({
	status,
	pausing = false
}: {
	status: QueueStatus,
	pausing?: boolean
}) {
	const label = pausing && status === 'paused' ? 'pausing' : status
	const spinning = status === 'provisioning' || status === 'running' || label === 'pausing'

	return (
		<Badge color={COLORS[status]} variant="light" size="sm">
			<Group gap={6} align="center" wrap="nowrap">
				{spinning ? <Loader size={10} color={COLORS[status]} /> : null}
				{label}
			</Group>
		</Badge>
	)
}
