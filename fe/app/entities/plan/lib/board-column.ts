import type { BuildSummary } from '~/entities/plan/model/build'
import { resolvePlanState } from '~/entities/plan/lib/plan-state'
import type { Plan, PlanState } from '~/entities/plan/model/plan'

export type BoardColumn =
	| 'drafting'
	| 'needs_approval'
	| 'scheduled'
	| 'building'
	| 'syncing'
	| 'verifying'
	| 'in_review'
	| 'bug_fixing'

export const BOARD_COLUMNS: { value: BoardColumn, label: string }[] = [
	{ value: 'drafting', label: 'Drafting' },
	{ value: 'needs_approval', label: 'Needs approval' },
	{ value: 'scheduled', label: 'Scheduled' },
	{ value: 'building', label: 'Building' },
	{ value: 'syncing', label: 'Syncing' },
	{ value: 'verifying', label: 'Verifying' },
	{ value: 'in_review', label: 'In review' },
	{ value: 'bug_fixing', label: 'Bug Fixing' }
]

// Only the states nothing more happens to. A failed plan is still active: it
// stopped on something a person has to look at, and on the board it stays in the
// column where its work stopped.
export const HISTORY_STATES: PlanState[] = ['merged', 'cancelled']

export function isHistoryPlan (plan: Pick<Plan, 'state' | 'status' | 'approvedAt'>): boolean {
	return HISTORY_STATES.includes(resolvePlanState(plan))
}

const DIRECT: Partial<Record<PlanState, BoardColumn>> = {
	drafting: 'drafting',
	needs_approval: 'needs_approval',
	scheduled: 'scheduled',
	held: 'scheduled',
	building: 'building',
	integrating: 'syncing',
	verifying: 'verifying',
	in_review: 'in_review',
	fixing_bugs: 'bug_fixing'
}

// A plan that stopped — on a decision, or on a failure — has no column of its own:
// it stays where its work stopped, so the board still says how far it got. A grill
// that failed never had a build and stays with the drafts. A stop caused by a failed
// sync goes to Syncing regardless of bullet progress: the build is done, its merge
// isn't.
export function boardColumn (entry: {
	state: PlanState,
	build: Pick<BuildSummary, 'bulletsDone' | 'bulletsTotal' | 'needsYouReason'> | null
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

	if (entry.build.needsYouReason === 'integration') {
		return 'syncing'
	}

	if (entry.build.bulletsDone === 0) {
		return 'scheduled'
	}

	return entry.build.bulletsDone < entry.build.bulletsTotal ? 'building' : 'verifying'
}
