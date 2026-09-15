import { Accordion, Alert, Badge, Group, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useState } from 'react'

import { BOARD_COLUMNS, useLineQuery, usePlansQuery, type BoardColumn, type PlanListEntry } from '~/entities/plan'
import { useReorderLine } from '~/features/reorder-line'
import { toErrorMessage } from '~/shared/lib'
import { SectionLoader } from '~/shared/ui'
import { groupByColumn, reorderedLine } from '~/widgets/plan-board/lib/columns'
import { BoardCard } from '~/widgets/plan-board/ui/board-card'
import { CapacityStrip } from '~/widgets/plan-board/ui/capacity-strip'

// Read-only but for one thing: dragging within Scheduled. Line order is a property
// of the line, so it has no plan page to live on.
export function PlanBoard () {
	const plans = usePlansQuery()
	const line = useLineQuery()
	const reorder = useReorderLine()
	const [dragged, setDragged] = useState<string | null>(null)
	// Read synchronously rather than in an effect: the two layouts are different
	// enough that settling into the right one a frame later reads as a glitch.
	const wide = useMediaQuery('(width >= 48em)', true, { getInitialValueInEffect: false })

	if (plans.isPending) {
		return <SectionLoader />
	}

	if (plans.error) {
		return (
			<Alert color="red" title="Could not load plans">
				{toErrorMessage(plans.error, 'Unknown error')}
			</Alert>
		)
	}

	const groups = groupByColumn(plans.data)
	const visibleColumns = BOARD_COLUMNS.filter((column) => groups[column.value].length > 0)

	const drop = (target: PlanListEntry) => {
		const reordered = dragged === null ? null : reorderedLine({ scheduled: groups.scheduled, draggedPlanId: dragged, target })

		setDragged(null)

		if (reordered !== null) {
			reorder.mutate(reordered)
		}
	}

	const reorderable = (column: BoardColumn, entry: PlanListEntry): boolean =>
		wide && column === 'scheduled' && entry.build !== null

	const cards = (column: BoardColumn) =>
		groups[column].map((entry) => (
			<BoardCard
				key={entry.id}
				entry={entry}
				draggable={reorderable(column, entry)}
				onDragStart={() => {
					setDragged(entry.id)
				}}
				onDrop={() => {
					drop(entry)
				}}
			/>
		))

	return (
		<Stack gap="md">
			<CapacityStrip capacity={line.data?.capacity ?? []} />

			{plans.data.length === 0 ? (
				<Text c="dimmed" size="sm">
					No plans yet. Paste a ticket and let it grill you.
				</Text>
			) : null}

			{wide ? (
				<div className="flex gap-3 overflow-x-auto pb-2">
					{visibleColumns.map((column) => (
						<Stack key={column.value} gap="xs" className="w-60 min-w-60">
							<Group gap="xs">
								<Text size="sm" fw={600}>
									{column.label}
								</Text>
								<Badge size="xs" variant="light" color="gray">
									{groups[column.value].length}
								</Badge>
							</Group>
							{cards(column.value)}
						</Stack>
					))}
				</div>
			) : (
				<Accordion multiple variant="separated" defaultValue={visibleColumns.map((column) => column.value)}>
					{visibleColumns.map((column) => (
						<Accordion.Item key={column.value} value={column.value}>
							<Accordion.Control>
								<Group gap="xs">
									<Text size="sm" fw={600}>
										{column.label}
									</Text>
									<Badge size="xs" variant="light" color="gray">
										{groups[column.value].length}
									</Badge>
								</Group>
							</Accordion.Control>
							<Accordion.Panel>
								<Stack gap="xs">{cards(column.value)}</Stack>
							</Accordion.Panel>
						</Accordion.Item>
					))}
				</Accordion>
			)}
		</Stack>
	)
}
