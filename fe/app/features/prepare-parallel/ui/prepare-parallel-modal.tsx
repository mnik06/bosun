import { Alert, Button, List, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router'

import { planLabel, type Plan } from '~/entities/plan'
import { usePreparePlans } from '~/features/prepare-parallel/api/use-prepare-plans'
import { AppModal } from '~/shared/ui'

function Body ({ plans, onDone }: { plans: Plan[], onDone: () => void }) {
	const navigate = useNavigate()
	const prepare = usePreparePlans()
	// A queue runs in a worktree of one machine's repository, so plans on two
	// machines have nowhere common for a shared foundation to be built.
	const machineIds = [...new Set(plans.map((plan) => plan.machineId))]

	if (machineIds.length > 1) {
		return (
			<Alert color="yellow" variant="light" title="Those plans are on different machines">
				<Text size="sm">
					A queue runs in a worktree of one machine, so a foundation shared between these plans
					has nowhere common to be built. Select plans from a single machine.
				</Text>
			</Alert>
		)
	}

	return (
		<Stack gap="md">
			<Text size="sm">
				A session reads all {plans.length} plans and writes one plan for what more than one of
				them needs — schema, enums, shared types, API contracts. It then rewrites these to
				consume that work rather than build it, and blocks them until it lands.
			</Text>

			<List size="sm" spacing={4}>
				{plans.map((plan) => (
					<List.Item key={plan.id}>{planLabel(plan)}</List.Item>
				))}
			</List>

			<Text size="xs" c="dimmed">
				Each of them loses its sign-off, because the plan you signed off is not the plan that
				comes back. If they turn out to share nothing, no plan is written and the session says
				why.
			</Text>

			<Button
				loading={prepare.isPending}
				onClick={() => {
					prepare.mutate(
						plans.map((plan) => plan.id),
						{
							onSuccess: (plan) => {
								onDone()
								void navigate(`/plans/${plan.id}`)
							}
						}
					)
				}}
			>
				Prepare for parallel work
			</Button>
		</Stack>
	)
}

export function PrepareParallelModal ({
	plans,
	opened,
	onClose
}: {
	plans: Plan[],
	opened: boolean,
	onClose: () => void
}) {
	return (
		<AppModal opened={opened} onClose={onClose} title="Prepare for parallel work" centered>
			<Body plans={plans} onDone={onClose} />
		</AppModal>
	)
}
