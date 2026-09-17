import type { Plan, PlanState } from '~/entities/plan/model/plan'

export const PLAN_STATE_LABEL: Record<PlanState, { label: string, color: string }> = {
	drafting: { label: 'drafting', color: 'blue' },
	needs_approval: { label: 'needs approval', color: 'grape' },
	scheduled: { label: 'scheduled', color: 'gray' },
	held: { label: 'held', color: 'yellow' },
	building: { label: 'building', color: 'blue' },
	integrating: { label: 'syncing', color: 'cyan' },
	verifying: { label: 'verifying', color: 'indigo' },
	in_review: { label: 'in review', color: 'green' },
	fixing_bugs: { label: 'fixing bugs', color: 'pink' },
	merged: { label: 'merged', color: 'teal' },
	needs_you: { label: 'needs you', color: 'orange' },
	failed: { label: 'failed', color: 'red' },
	cancelled: { label: 'cancelled', color: 'gray' }
}

export const WORKING_STATES: PlanState[] = ['building', 'integrating', 'verifying', 'fixing_bugs']

// Only reached for a row pushed without its derived state, so it says the little
// the plan row alone can support rather than guessing at a build.
export function resolvePlanState (plan: Pick<Plan, 'state' | 'status' | 'approvedAt'>): PlanState {
	if (plan.state !== null) {
		return plan.state
	}

	if (plan.status === 'failed') {
		return 'failed'
	}

	if (plan.status === 'planning') {
		return 'drafting'
	}

	return plan.approvedAt === null ? 'needs_approval' : 'scheduled'
}
