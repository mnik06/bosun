import { Alert, Anchor, Card, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { QueueStatusBadge, useMachineQueuesQuery, type Queue } from '~/entities/queue'
import { toErrorMessage } from '~/shared/lib'

function QueueRow ({ queue }: { queue: Queue }) {
	return (
		<Group gap="xs" align="center" wrap="nowrap">
			<Text size="sm" fw={500} truncate>
				{queue.name}
			</Text>
			<QueueStatusBadge status={queue.status} />
		</Group>
	)
}

function QueueList ({ machineId }: { machineId: string }) {
	const { data, isPending, error } = useMachineQueuesQuery(machineId)

	if (isPending) {
		return (
			<Center py="md">
				<Loader size="sm" />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load queues">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	if (data.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				No queues yet. A queue is a worktree on this machine — plans pushed to it run there, one
				after another, without touching the checkout you work in.
			</Text>
		)
	}

	return (
		<Stack gap="xs">
			{data.map((queue) => (
				<QueueRow key={queue.id} queue={queue} />
			))}
		</Stack>
	)
}

// Read-only on purpose: a queue is created, paused, resumed and killed in one
// place, and that place is the queues page. This card only answers "what is
// running on this box".
export function QueuesPanel ({ machineId }: { machineId: string }) {
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				<Group justify="space-between" align="center">
					<Stack gap={2}>
						<Text fw={600}>Queues</Text>
						<Text size="sm" c="dimmed">
							Isolated worktrees that execute plans on this machine.
						</Text>
					</Stack>

					<Anchor component={Link} to="/queues" size="sm">
						Manage queues
					</Anchor>
				</Group>

				<QueueList machineId={machineId} />
			</Stack>
		</Card>
	)
}
