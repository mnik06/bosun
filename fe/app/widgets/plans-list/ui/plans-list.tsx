import { Alert, Card, Center, Checkbox, Group, Loader, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { useMachinesQuery } from '~/entities/machine'
import { PlanStatusBadge, usePlansQuery } from '~/entities/plan'
import { DeletePlanAction } from '~/features/delete-plan'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'

// Selection is the page's, not the list's: the button that acts on it lives in
// the page header beside New plan, and two copies of the same state is how they
// drift apart.
export function PlansList ({
	selected,
	onSelectedChange
}: {
	selected: string[],
	onSelectedChange: (next: string[]) => void
}) {
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
				<Group key={plan.id} gap="sm" align="center" wrap="nowrap">
					<Checkbox
						aria-label={`Select ${plan.title ?? 'plan'}`}
						checked={selected.includes(plan.id)}
						// Only a finished, confirmed plan has tracer bullets somebody has
						// agreed to: queueing one still being grilled would put an empty
						// plan on a worktree, and an unconfirmed one is refused anyway.
						disabled={plan.status !== 'ready' || plan.confirmedAt === null}
						onChange={(event) => {
							onSelectedChange(
								event.currentTarget.checked
									? [...selected, plan.id]
									: selected.filter((id) => id !== plan.id)
							)
						}}
					/>

					<Card
						className="grow"
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
							<Group gap="xs" wrap="nowrap">
								<PlanStatusBadge plan={plan} />
								<DeletePlanAction planId={plan.id} title={`#${plan.number}`} />
							</Group>
						</Group>
					</Card>
				</Group>
			))}
		</Stack>
	)
}
