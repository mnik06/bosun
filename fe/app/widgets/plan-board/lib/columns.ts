import {
	BOARD_COLUMNS,
	boardColumn,
	resolvePlanState,
	type BoardColumn,
	type PlanListEntry
} from '~/entities/plan'
import { moveBuild } from '~/features/reorder-line'

export function groupByColumn (entries: PlanListEntry[]): Record<BoardColumn, PlanListEntry[]> {
	const groups = Object.fromEntries(BOARD_COLUMNS.map((column) => [column.value, []])) as unknown as Record<
		BoardColumn,
		PlanListEntry[]
	>

	for (const entry of entries) {
		const column = boardColumn({ state: resolvePlanState(entry), build: entry.build })

		if (column !== null) {
			groups[column].push(entry)
		}
	}

	groups.scheduled.sort((a, b) => (a.build?.position ?? 0) - (b.build?.position ?? 0))

	return groups
}

// Line order belongs to one repository, so a card dropped on a card of another
// repository's line reorders nothing.
export function reorderedLine (opts: {
	scheduled: PlanListEntry[],
	draggedPlanId: string,
	target: PlanListEntry
}): { repositoryId: string, buildIds: string[] } | null {
	const dragged = opts.scheduled.find((entry) => entry.id === opts.draggedPlanId)
	const { repositoryId } = opts.target

	if (dragged?.build == null || opts.target.build === null || repositoryId === null || dragged.repositoryId !== repositoryId) {
		return null
	}

	const order = opts.scheduled.flatMap((entry) =>
		entry.repositoryId === repositoryId && entry.build !== null ? [entry.build.id] : []
	)
	const buildIds = moveBuild({ order, dragged: dragged.build.id, target: opts.target.build.id })

	return buildIds.every((id, index) => id === order[index]) ? null : { repositoryId, buildIds }
}
