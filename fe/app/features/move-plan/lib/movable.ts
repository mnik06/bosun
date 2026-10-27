import type { PlanDetail } from '~/entities/plan'

const UNSTARTED = new Set(['scheduled', 'held', 'needs_you'])

// The backend's rule, mirrored so the picker is shown only where a pick is taken:
// written, and no worktree cut — once one is, the plan's commits and sessions live
// on that machine.
export function planMovable (detail: Pick<PlanDetail, 'plan' | 'build'>): boolean {
	const { plan, build } = detail

	return plan.status === 'ready' && (build === null || (build.worktreePath === null && UNSTARTED.has(build.status)))
}
