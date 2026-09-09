import { Alert, Anchor, Card, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { useMachinesQuery } from '~/entities/machine'
import { QueueStatusBadge, useQueuesQuery, type Queue } from '~/entities/queue'
import { QueueControls } from '~/features/control-queue'
import { CreateQueueButton } from '~/features/create-queue'
import { KillQueueButton } from '~/features/kill-queue'
import { toErrorMessage } from '~/shared/lib'
import { Page } from '~/shared/ui'

function QueueCard ({ queue, machineName }: { queue: Queue, machineName: string }) {
	return (
		<Card withBorder padding="md" radius="md" className="relative">
			<Group justify="space-between" align="start" gap="sm">
				<Stack gap={2} className="min-w-0 grow">
					<Group gap="xs" wrap="wrap">
						{/* The pseudo-element covers the card, so the row is one big target
						    and the accessible name is still the queue's own link. */}
						<Anchor
							component={Link}
							to={`/queues/${queue.id}`}
							fw={600}
							className="after:absolute after:inset-0"
						>
							{queue.name}
						</Anchor>
						<QueueStatusBadge status={queue.status} />
						{queue.afk ? (
							<Text size="xs" c="dimmed">
								AFK
							</Text>
						) : null}
					</Group>

					<Text size="xs" c="dimmed">
						{machineName}
						{queue.baseRef === null ? '' : ` · from ${queue.baseRef}`}
					</Text>

					{queue.failureReason === null ? null : (
						<Text size="xs" c="red">
							{queue.failureReason}
						</Text>
					)}
				</Stack>

				{/* `relative` lifts the controls out from under the stretched link. */}
				<Group gap="xs" wrap="nowrap" className="relative shrink-0">
					<QueueControls queue={queue} />
					<KillQueueButton queue={queue} />
				</Group>
			</Group>
		</Card>
	)
}

function QueueList () {
	const { data, isPending, error } = useQueuesQuery()
	const machines = useMachinesQuery()

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
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
				No queues yet. A queue is a git worktree on one of your machines — create one here, then
				push plans to it.
			</Text>
		)
	}

	return (
		<Stack gap="sm">
			{data.map((queue) => (
				<QueueCard
					key={queue.id}
					queue={queue}
					machineName={
						machines.data?.find((machine) => machine.id === queue.machineId)?.name ??
						queue.machineId
					}
				/>
			))}
		</Stack>
	)
}

export default function QueuesPage () {
	return (
		<Page title="Queues" actions={<CreateQueueButton />}>
			<QueueList />
		</Page>
	)
}
