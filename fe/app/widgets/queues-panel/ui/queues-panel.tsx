import { Alert, Anchor, Card, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { QueueStatusBadge, useMachineQueuesQuery, type Queue } from '~/entities/queue'
import { CreateQueueButton } from '~/features/create-queue'
import { QueueControls } from '~/features/control-queue'
import { DeleteQueueButton } from '~/features/delete-queue'
import { toErrorMessage } from '~/shared/lib'

function QueueRow ({ queue }: { queue: Queue }) {
	return (
		<Card withBorder padding="sm" radius="md">
			<Group justify="space-between" align="start" wrap="nowrap">
				<Stack gap={4}>
					<Group gap="xs" align="center">
						<Anchor component={Link} to={`/queues/${queue.id}`} fw={600}>
							{queue.name}
						</Anchor>
						<QueueStatusBadge status={queue.status} />
						{queue.afk ? (
							<Text size="xs" c="dimmed">
								AFK
							</Text>
						) : null}
					</Group>

					<Text size="xs" c="dimmed" className="font-mono">
						{queue.worktreePath ?? `~/.bosun/worktrees/${queue.slug}`}
						{queue.baseRef === null ? '' : ` · from ${queue.baseRef}`}
					</Text>

					{queue.failureReason === null ? null : (
						<Text size="xs" c="red">
							{queue.failureReason}
						</Text>
					)}
				</Stack>

				<Group gap="xs" wrap="nowrap">
					<QueueControls queue={queue} />
					<DeleteQueueButton queue={queue} />
				</Group>
			</Group>
		</Card>
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
		<Stack gap="sm">
			{data.map((queue) => (
				<QueueRow key={queue.id} queue={queue} />
			))}
		</Stack>
	)
}

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

					<CreateQueueButton machineId={machineId} />
				</Group>

				<QueueList machineId={machineId} />
			</Stack>
		</Card>
	)
}
