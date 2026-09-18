import type { BuildStatus } from '~/entities/plan'

const STEP: Partial<Record<BuildStatus, number>> = {
	scheduled: 0,
	held: 0,
	building: 0,
	waiting_answer: 0,
	integrating: 1,
	waiting_verify: 2,
	driving: 2,
	fixing: 2,
	rechecking: 2,
	in_review: 3,
	fixing_bugs: 3,
	merged: 4
}

// A build that stopped keeps the step its work reached: a failed bullet is still
// building, a failed re-check is still verifying.
export function executionStep (opts: {
	status: BuildStatus,
	bulletsDone: number,
	bulletsTotal: number,
	verifyStarted: boolean
}): number {
	const direct = STEP[opts.status]

	if (direct !== undefined) {
		return direct
	}

	if (opts.verifyStarted) {
		return 2
	}

	return opts.bulletsTotal > 0 && opts.bulletsDone >= opts.bulletsTotal ? 1 : 0
}
