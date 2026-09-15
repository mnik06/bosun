import { Badge, Card, Group, Indicator, Text } from '@mantine/core'
import { Link } from 'react-router'

import { useUnreadCountsQuery } from '~/entities/notification'
import { PLAN_STATE_LABEL, resolvePlanState, type PlanListEntry, type PlanState } from '~/entities/plan'

const FLAGGED: PlanState[] = ['held', 'needs_you', 'failed']

function fallbackReason (entry: PlanListEntry): string | null {
	const { build } = entry

	if (build === null || build.bulletsTotal === 0) {
		return null
	}

	return `bullet ${String(Math.min(build.bulletsDone + 1, build.bulletsTotal))}/${String(build.bulletsTotal)}`
}

export function BoardCard ({
	entry,
	draggable,
	onDragStart,
	onDrop
}: {
	entry: PlanListEntry,
	draggable: boolean,
	onDragStart: () => void,
	onDrop: () => void
}) {
	const state = resolvePlanState(entry)
	const owner = entry.ownerEmail?.split('@')[0] ?? null
	const reason = entry.reason ?? fallbackReason(entry)
	const unreadCounts = useUnreadCountsQuery()
	const unread = unreadCounts.data?.find((count) => count.planId === entry.id)?.count ?? 0

	return (
		<Indicator disabled={unread === 0} label={unread} size={16} color="blue" offset={6}>
			<Card
				withBorder
				padding="sm"
				radius="md"
				component={Link}
				to={`/plans/${entry.id}`}
				draggable={draggable}
				className={draggable ? 'cursor-grab' : undefined}
				onDragStart={onDragStart}
				onDragOver={(event) => {
					if (draggable) {
						event.preventDefault()
					}
				}}
				onDrop={(event) => {
					event.preventDefault()
					onDrop()
				}}
			>
				<Group gap={6} wrap="nowrap">
					<Text size="xs" c="dimmed" className="shrink-0">
						#{entry.number}
					</Text>
					<Text size="sm" fw={600} truncate>
						{entry.title ?? 'Untitled'}
					</Text>
				</Group>

				<Group gap={6} wrap="nowrap" mt={2}>
					{owner === null ? null : (
						<Text size="xs" c="dimmed" truncate>
							{owner}
						</Text>
					)}
					{FLAGGED.includes(state) ? (
						<Badge size="xs" variant="light" color={PLAN_STATE_LABEL[state].color} className="shrink-0">
							{PLAN_STATE_LABEL[state].label}
						</Badge>
					) : null}
				</Group>

				{reason === null ? null : (
					<Text size="xs" c={state === 'needs_you' ? 'orange' : 'dimmed'} lineClamp={2} mt={4}>
						{reason}
					</Text>
				)}
			</Card>
		</Indicator>
	)
}
