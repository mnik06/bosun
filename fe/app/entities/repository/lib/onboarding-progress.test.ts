import { describe, expect, it } from 'vitest'

import type { OnboardingStep } from '~/entities/repository/model/repository'

import { onboardingProgress } from './onboarding-progress'

function step (label: string, progress: number | null): OnboardingStep {
	return { label, status: 'info', detail: null, progress, at: '2026-09-14T00:00:00.000Z' }
}

describe('onboardingProgress', () => {
	it('fills discovery up to 40% and calls it an estimate', () => {
		const progress = onboardingProgress({
			phase: 'discover',
			status: 'discovering',
			steps: [step('Reading', 0.5), step('Scanning', null)]
		})

		expect(progress).toEqual({ percent: 20, label: 'Discovering — about 20%' })
	})

	it('never moves backwards when a later step reports less', () => {
		const progress = onboardingProgress({
			phase: 'discover',
			status: 'discovering',
			steps: [step('Reading', 0.75), step('Scanning', 0.25)]
		})

		expect(progress.percent).toBe(30)
	})

	it('counts only steps from Verify started on once a discover run verifies', () => {
		const progress = onboardingProgress({
			phase: 'discover',
			status: 'verifying',
			steps: [step('Reading', 1), step('Verify started', 0), step('Installed', 0.4)]
		})

		expect(progress).toEqual({ percent: 70, label: 'Verifying — 70%' })
	})

	it('holds a waiting run at the start of its verify band', () => {
		expect(onboardingProgress({ phase: 'discover', status: 'needs_input', steps: [step('Reading', 1)] }).percent).toBe(45)
		expect(onboardingProgress({ phase: 'verify', status: 'needs_input', steps: [] }).percent).toBe(5)
	})

	it('spreads a verify-only run across 10 to 100', () => {
		const progress = onboardingProgress({ phase: 'verify', status: 'verifying', steps: [step('Installed', 0.5)] })

		expect(progress.percent).toBe(55)
	})

	it('reports a failure at the percent its band had reached', () => {
		expect(onboardingProgress({
			phase: 'discover',
			status: 'failed',
			steps: [step('Reading', 1), step('Verify started', 0), step('Started', 0.24)]
		})).toEqual({ percent: 62, label: 'Failed at 62%' })
		expect(onboardingProgress({ phase: 'discover', status: 'failed', steps: [step('Reading', 0.5)] }).percent).toBe(20)
	})
})
