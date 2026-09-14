import { type Build, type BuildStatus } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { type PlanState } from 'src/types/PlanStateSchema';

const BY_BUILD: Record<BuildStatus, PlanState> = {
	scheduled: 'scheduled',
	held: 'held',
	building: 'building',
	waiting_answer: 'building',
	integrating: 'integrating',
	waiting_verify: 'verifying',
	driving: 'verifying',
	fixing: 'verifying',
	rechecking: 'verifying',
	in_review: 'in_review',
	merged: 'merged',
	needs_you: 'needs_you',
	failed: 'failed',
	cancelled: 'cancelled'
};

// The build outranks the plan row wherever both have an opinion: once approved,
// what a plan is doing is what its build is doing. A revision after a build was
// cancelled puts the plan back in front of a person, so a plan that is being
// rewritten or waits for approval again says so rather than "cancelled".
export function planStateOf(opts: { plan: Plan; build: Build | null }): PlanState {
	const { plan, build } = opts;

	if (plan.status === 'planning') {
		return 'drafting';
	}

	if (build && (build.status !== 'cancelled' || plan.approvedAt !== null)) {
		return BY_BUILD[build.status];
	}

	return plan.status === 'failed' ? 'failed' : 'needs_approval';
}
