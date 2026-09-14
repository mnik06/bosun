import type { PlanDetail, PlanState } from '~/entities/plan/model/plan'

export type PlanTab = 'chat' | 'plan' | 'execution' | 'changes' | 'verification'

export const PLAN_TAB_LABEL: Record<PlanTab, string> = {
	chat: 'Chat',
	plan: 'Plan',
	execution: 'Execution',
	changes: 'Changes',
	verification: 'Verification'
}

type TabSource = Pick<PlanDetail, 'plan' | 'slices' | 'build' | 'runs' | 'integrations' | 'findings'>

// A tab exists once it has something to show. One that exists only to say "not
// yet" is a tab somebody opens to learn nothing.
export function visiblePlanTabs (detail: TabSource): PlanTab[] {
	const published = detail.plan.title !== null && detail.slices.length > 0
	const approved = detail.plan.approvedAt !== null || detail.build !== null
	const committed =
		detail.runs.some((run) => run.commitSha !== null) ||
		detail.build?.prUrl != null ||
		detail.integrations.length > 0
	const driven =
		detail.findings.length > 0 ||
		detail.runs.some(
			(run) => (run.phase === 'drive' || run.phase === 'recheck') && run.status !== 'pending'
		)

	return [
		'chat',
		...(published ? (['plan'] as const) : []),
		...(approved ? (['execution'] as const) : []),
		...(committed ? (['changes'] as const) : []),
		...(driven ? (['verification'] as const) : [])
	]
}

const PREFERRED: Record<PlanState, PlanTab[]> = {
	drafting: ['chat'],
	needs_approval: ['plan', 'chat'],
	scheduled: ['execution', 'plan'],
	held: ['execution', 'plan'],
	building: ['execution', 'plan'],
	integrating: ['execution', 'plan'],
	verifying: ['execution', 'plan'],
	needs_you: ['execution', 'plan'],
	failed: ['execution', 'chat'],
	cancelled: ['execution', 'plan'],
	in_review: ['verification', 'changes', 'execution'],
	merged: ['verification', 'changes', 'execution']
}

export function defaultPlanTab (opts: { state: PlanState, tabs: PlanTab[] }): PlanTab {
	return PREFERRED[opts.state].find((tab) => opts.tabs.includes(tab)) ?? 'chat'
}
