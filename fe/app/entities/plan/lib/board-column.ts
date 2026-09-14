import type { BuildSummary } from '~/entities/plan/model/build'
import type { PlanState } from '~/entities/plan/model/plan'

export type BoardColumn = 'drafting' | 'needs_approval' | 'scheduled' | 'building' | 'verifying' | 'in_review'

export const BOARD_COLUMNS: { value: BoardColumn, label: string }[] = [
	{ value: 'drafting', label: 'Drafting' },
	{ value: 'needs_approval', label: 'Needs approval' },
	{ value: 'scheduled', label: 'Scheduled' },
	{ value: 'building', label: 'Building' },
	{ value: 'verifying', label: 'Verifying' },
	{ value: 'in_review', label: 'In review' }
]

export const HISTORY_STATES: PlanState[] = ['merged', 'failed', 'cancelled']

const DIRECT: Partial<Record<PlanState, BoardColumn>> = {
	drafting: 'drafting',
	needs_approval: 'needs_approval',
	scheduled: 'scheduled',
	held: 'scheduled',
	building: 'building',
	integrating: 'building',
	verifying: 'verifying',
	in_review: 'in_review'
}

// A plan that stopped — on a decision, or on a failure — has no column of its own:
// it stays where its work stopped, so the board still says how far it got. A grill
// that failed never had a build and stays with the drafts.
export function boardColumn (entry: {
	state: PlanState,
	build: Pick<BuildSummary, 'bulletsDone' | 'bulletsTotal'> | null
}): BoardColumn | null {
	const direct = DIRECT[entry.state]

	if (direct !== undefined) {
		return direct
	}

	if (entry.state !== 'needs_you' && entry.state !== 'failed') {
		return null
	}

	if (entry.build === null) {
		return entry.state === 'failed' ? 'drafting' : 'scheduled'
	}

	if (entry.build.bulletsDone === 0) {
		return 'scheduled'
	}

	return entry.build.bulletsDone < entry.build.bulletsTotal ? 'building' : 'verifying'
}
