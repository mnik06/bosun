import { Alert, Card, Center, Checkbox, Group, Loader, Stack, Text, Tooltip } from '@mantine/core'
import { Link } from 'react-router'

import { useMachinesQuery } from '~/entities/machine'
import { planQueueRefusal, PlanStatusBadge, usePlansQuery, type Plan } from '~/entities/plan'
import { DeletePlanAction } from '~/features/delete-plan'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'

function PlanRow ({
	plan,
	machineName,
	checked,
	onToggle
}: {
	plan: Plan,
	machineName: string,
	checked: boolean,
	onToggle: (next: boolean) => void
}) {
	// The same rule the push endpoint enforces, so the checkbox never offers
	// something the API is going to refuse.
	const refusal = planQueueRefusal(plan)

	return (
		<Group gap="sm" align="center" wrap="nowrap">
			<Tooltip label={refusal ?? ''} disabled={refusal === null}>
				<Checkbox
					aria-label={`Select ${plan.title ?? 'plan'}`}
					checked={checked}
					disabled={refusal !== null}
					onChange={(event) => {
						onToggle(event.currentTarget.checked)
					}}
				/>
			</Tooltip>

			<Card
				className="grow"
				withBorder
				padding="md"
				radius="md"
				component={Link}
				to={`/plans/${plan.id}`}
			>
				<Group justify="space-between" align="start" gap="sm">
					<Stack gap={2} className="min-w-0 grow">
						<Text fw={600} truncate>
							{plan.title ?? 'Untitled'}
						</Text>
						<Text size="xs" c="dimmed">
							{machineName} · {formatRelativeTime(plan.createdAt)}
						</Text>
					</Stack>
					<Group gap="xs" wrap="nowrap" className="shrink-0">
						<PlanStatusBadge plan={plan} />
						<DeletePlanAction planId={plan.id} title={`#${plan.number}`} />
					</Group>
				</Group>
			</Card>
		</Group>
	)
}

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
				<PlanRow
					key={plan.id}
					plan={plan}
					machineName={
						machines.data?.find((machine) => machine.id === plan.machineId)?.name ??
						plan.machineId
					}
					checked={selected.includes(plan.id)}
					onToggle={(next) => {
						onSelectedChange(
							next ? [...selected, plan.id] : selected.filter((id) => id !== plan.id)
						)
					}}
				/>
			))}
		</Stack>
	)
}
