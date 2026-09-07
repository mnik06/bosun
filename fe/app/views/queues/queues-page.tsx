import { Alert, Anchor, Card, Center, Container, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'

import { useMachinesQuery } from '~/entities/machine'
import { QueueStatusBadge, useQueuesQuery } from '~/entities/queue'
import { toErrorMessage } from '~/shared/lib'

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
				No queues yet. A queue is a git worktree on one of your machines — create one from that
				machine&apos;s page, then push plans to it.
			</Text>
		)
	}

	return (
		<Stack gap="sm">
			{data.map((queue) => (
				<Card key={queue.id} withBorder padding="md" radius="md">
					<Group justify="space-between" align="start" wrap="nowrap">
						<Stack gap={2} className="min-w-0">
							<Group gap="xs">
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
							<Text size="xs" c="dimmed">
								{machines.data?.find((machine) => machine.id === queue.machineId)?.name ??
												queue.machineId}
								{queue.baseRef === null ? '' : ` · from ${queue.baseRef}`}
							</Text>
						</Stack>
					</Group>
				</Card>
			))}
		</Stack>
	)
}

export default function QueuesPage () {
	return (
		<Container size="md" py="xl">
			<Stack gap="lg">
				<Title order={2}>Queues</Title>
				<QueueList />
			</Stack>
		</Container>
	)
}
