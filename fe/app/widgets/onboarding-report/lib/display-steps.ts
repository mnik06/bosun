import type { OnboardingRun, OnboardingStep } from '~/entities/repository'

// Steps are an append-only log: a command is reported running and then again
// passed or failed under the same label, and a session may open a line it never
// closes. Folding by label keeps one line per step, and a running line counts as
// finished once anything was reported after it.
export function displaySteps (run: Pick<OnboardingRun, 'status' | 'steps'>): OnboardingStep[] {
	const byLabel = new Map<string, OnboardingStep>()

	for (const step of run.steps) {
		const previous = byLabel.get(step.label)

		byLabel.delete(step.label)
		byLabel.set(step.label, { ...step, detail: step.detail ?? previous?.detail ?? null })
	}

	const folded = [...byLabel.values()]
	const active = run.status === 'discovering' || run.status === 'verifying'

	return folded.map((step, index) => {
		if (step.status !== 'running') {
			return step
		}

		if (index < folded.length - 1) {
			return { ...step, status: 'passed' }
		}

		return active ? step : { ...step, status: 'info' }
	})
}
