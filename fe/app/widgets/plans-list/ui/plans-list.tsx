import { Alert, Card, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { useMachinesQuery } from '~/entities/machine'
import { PlanStatusBadge, usePlansQuery } from '~/entities/plan'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'

export function PlansList () {
	const { data, isPending, error } = usePlansQuery()
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
			<Alert color="red" title="Could not load plans">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	if (data.length === 0) {
		return (
			<Text c="dimmed" size="sm">
				No plans yet. Paste a ticket and let it grill you.
			</Text>
		)
	}

	return (
		<Stack gap="sm">
			{data.map((plan) => (
				<Card
					key={plan.id}
					withBorder
					padding="md"
					radius="md"
					component={Link}
					to={`/plans/${plan.id}`}
				>
					<Group justify="space-between" wrap="nowrap" align="start">
						<Stack gap={2} className="min-w-0">
							<Text fw={600} truncate>
								{plan.title ?? 'Untitled'}
							</Text>
							<Text size="xs" c="dimmed">
								{machines.data?.find((machine) => machine.id === plan.machineId)?.name ??
									plan.machineId}{' '}
								· {formatRelativeTime(plan.createdAt)}
							</Text>
						</Stack>
						<PlanStatusBadge plan={plan} />
					</Group>
				</Card>
			))}
		</Stack>
	)
}
