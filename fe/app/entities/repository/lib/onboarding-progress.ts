import type { OnboardingRun, OnboardingStep } from '~/entities/repository/model/repository'

export interface OnboardingProgress {
	percent: number
	label: string
}

const VERIFY_STARTED = 'Verify started'

// The bar of a discover run is split: discovery fills the first 40%, waiting for
// inputs holds it at 45, verify fills 50 to 100. A verify-only run has nothing
// before it but the inputs.
const DISCOVER_BAND = { waiting: 45, from: 50, span: 50 }
const VERIFY_BAND = { waiting: 5, from: 10, span: 90 }
const DISCOVERY_SPAN = 40

// Max rather than the latest step: a later step that reports less must not move
// the bar backwards within the phase.
function maxProgress (steps: OnboardingStep[]): number {
	return steps.reduce((highest, step) => Math.max(highest, step.progress ?? 0), 0)
}

function phaseSteps (run: Pick<OnboardingRun, 'phase' | 'steps'>): { discovery: OnboardingStep[], verify: OnboardingStep[] | null } {
	if (run.phase === 'verify') {
		return { discovery: [], verify: run.steps }
	}

	const start = run.steps.findIndex((step) => step.label === VERIFY_STARTED)

	return start === -1
		? { discovery: run.steps, verify: null }
		: { discovery: run.steps.slice(0, start), verify: run.steps.slice(start) }
}

function verifyPercent (run: Pick<OnboardingRun, 'phase'>, steps: OnboardingStep[]): number {
	const band = run.phase === 'verify' ? VERIFY_BAND : DISCOVER_BAND

	return band.from + Math.round(band.span * maxProgress(steps))
}

function reachedPercent (run: Pick<OnboardingRun, 'phase' | 'steps'>): number {
	const { discovery, verify } = phaseSteps(run)

	return verify === null
		? Math.round(DISCOVERY_SPAN * maxProgress(discovery))
		: verifyPercent(run, verify)
}

export function onboardingProgress (run: Pick<OnboardingRun, 'phase' | 'status' | 'steps'>): OnboardingProgress {
	switch (run.status) {
		case 'ready':
			return { percent: 100, label: 'Ready' }
		case 'needs_input':
			return {
				percent: run.phase === 'verify' ? VERIFY_BAND.waiting : DISCOVER_BAND.waiting,
				label: 'Waiting for inputs'
			}
		case 'failed': {
			const percent = reachedPercent(run)

			return { percent, label: `Failed at ${percent}%` }
		}
		case 'discovering': {
			const percent = reachedPercent(run)

			return { percent, label: `Discovering — about ${percent}%` }
		}
		case 'verifying': {
			const percent = verifyPercent(run, phaseSteps(run).verify ?? [])

			return { percent, label: `Verifying — ${percent}%` }
		}
	}
}
