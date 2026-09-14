import { Anchor, Box, Group, Text } from '@mantine/core'
import { Link } from 'react-router'

import { useMachinesQuery } from '~/entities/machine'
import { PLAN_STATE_LABEL, resolvePlanState, type PlanDetail } from '~/entities/plan'
import { AfkSwitch } from '~/features/toggle-plan-afk'
import { statusLine } from '~/widgets/plan-header/lib/status-line'
import { PlanMenu, PrimaryAction } from '~/widgets/plan-header/ui/plan-actions'
import { PlanPanels } from '~/widgets/plan-header/ui/plan-panels'

// One header above every tab, carrying the state, what that state allows, and
// anything waiting on a person — answerable from whichever tab is open.
export function PlanHeader ({ detail }: { detail: PlanDetail }) {
	const machines = useMachinesQuery()
	const state = resolvePlanState(detail.plan)
	const machineId = detail.build?.machineId ?? null
	const machineName =
		machineId === null ? null : (machines.data?.find((machine) => machine.id === machineId)?.name ?? null)
	const line = statusLine({ detail, state, machineName })

	return (
		<div className="flex shrink-0 flex-col gap-2">
			<Group justify="space-between" gap="sm" wrap="nowrap">
				<Group gap="sm" wrap="nowrap" className="min-w-0">
					<Anchor component={Link} to="/plans" size="sm" className="shrink-0 whitespace-nowrap">
						← Plans
					</Anchor>
					<Text size="sm" fw={600} truncate className="min-w-0 grow">
						<Text component="span" c="dimmed" fw={500}>
							#{detail.plan.number}
						</Text>{' '}
						{detail.plan.title ?? 'Untitled'}
					</Text>
				</Group>

				<Group gap="xs" wrap="nowrap" className="shrink-0">
					{state === 'merged' || state === 'cancelled' ? null : <AfkSwitch plan={detail.plan} />}
					<PrimaryAction detail={detail} state={state} />
					<PlanMenu detail={detail} state={state} />
				</Group>
			</Group>

			<Group gap={6} wrap="nowrap" className="min-w-0">
				<Box
					w={8}
					h={8}
					className="shrink-0 rounded-full"
					bg={`var(--mantine-color-${PLAN_STATE_LABEL[state].color}-6)`}
				/>
				<Text size="xs" c="dimmed" truncate>
					{line.join(' · ')}
				</Text>
			</Group>

			<PlanPanels detail={detail} />
		</div>
	)
}
