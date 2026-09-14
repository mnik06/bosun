import { PLAN_STATE_LABEL, type BuildStatus, type DependencyView, type PlanDetail, type PlanState } from '~/entities/plan'

const PHASE_LINE: Partial<Record<BuildStatus, string>> = {
	waiting_answer: 'waiting on an answer',
	waiting_verify: 'waiting to verify',
	driving: 'driving',
	fixing: 'fixing findings',
	rechecking: 're-checking'
}

function bulletLine (detail: Pick<PlanDetail, 'runs'>): string | null {
	const bullets = detail.runs.filter((run) => run.phase === null && run.sliceKind === 'build')

	if (bullets.length === 0) {
		return null
	}

	const done = bullets.filter((run) => run.status === 'done').length

	return `bullet ${String(Math.min(done + 1, bullets.length))} of ${String(bullets.length)}`
}

function dependencyLine (dependency: DependencyView): string {
	const provider = `#${String(dependency.providerNumber)}`
	let piece = `${provider}'s bullet ${String(dependency.providerSliceOrdinal)}`

	if (dependency.providerSliceOrdinal === null) {
		piece = `all of ${provider}`
	} else if (dependency.providerSliceOrdinal === 1) {
		piece = `${provider}'s foundation`
	}

	return dependency.released || dependency.overriddenAt !== null ? `uses ${piece} ✓` : `after ${piece}`
}

export function statusLine (opts: {
	detail: Pick<PlanDetail, 'build' | 'runs' | 'dependencies'>,
	state: PlanState,
	machineName: string | null
}): string[] {
	const { label } = PLAN_STATE_LABEL[opts.state]
	const status = opts.detail.build?.status

	return [
		`${label.charAt(0).toUpperCase()}${label.slice(1)}`,
		opts.state === 'building' ? bulletLine(opts.detail) : null,
		status === undefined ? null : (PHASE_LINE[status] ?? null),
		opts.machineName,
		...opts.detail.dependencies.map(dependencyLine)
	].filter((part): part is string => part !== null)
}
