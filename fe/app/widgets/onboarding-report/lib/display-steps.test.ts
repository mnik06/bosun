import { describe, expect, it } from 'vitest'

import type { OnboardingStep } from '~/entities/repository'

import { displaySteps } from './display-steps'

function step (label: string, status: OnboardingStep['status'], detail: string | null = null): OnboardingStep {
	return { label, status, detail, progress: null, at: '2026-09-14T00:00:00.000Z' }
}

function statuses (steps: OnboardingStep[]): string[] {
	return steps.map((entry) => `${entry.label}:${entry.status}`)
}

describe('displaySteps', () => {
	it('settles running lines that later steps moved past', () => {
		const steps = displaySteps({
			status: 'needs_input',
			steps: [step('Reading', 'running'), step('Exploring', 'running'), step('Installed', 'passed')]
		})

		expect(statuses(steps)).toEqual(['Reading:passed', 'Exploring:passed', 'Installed:passed'])
	})

	it('keeps the last line spinning only while the run is active', () => {
		const running = [step('Installed', 'passed'), step('Start the apps', 'running')]

		expect(statuses(displaySteps({ status: 'verifying', steps: running }))).toEqual(['Installed:passed', 'Start the apps:running'])
		expect(statuses(displaySteps({ status: 'failed', steps: running }))).toEqual(['Installed:passed', 'Start the apps:info'])
	})

	it('folds a running line and its outcome into one, keeping the command', () => {
		const steps = displaySteps({
			status: 'verifying',
			steps: [step('Setup: deps', 'running', 'pnpm i'), step('Setup: deps', 'failed', null)]
		})

		expect(steps).toEqual([step('Setup: deps', 'failed', 'pnpm i')])
	})
})
