import { describe, expect, it } from 'vitest'

import { defaultPlanTab, visiblePlanTabs } from '~/entities/plan/lib/plan-tabs'
import type { Build, Integration, SliceRun } from '~/entities/plan/model/build'
import type { Plan, Slice } from '~/entities/plan/model/plan'

const plan = { title: null, approvedAt: null } as unknown as Plan
const slice = {} as unknown as Slice
const build = { prUrl: null } as unknown as Build

function run (overrides: Partial<SliceRun>): SliceRun {
	return { phase: null, status: 'pending', commitSha: null, ...overrides } as unknown as SliceRun
}

const empty = { plan, slices: [], build: null, runs: [], integrations: [], findings: [] }

describe('visiblePlanTabs', () => {
	it('shows only the chat while nothing is published', () => {
		expect(visiblePlanTabs(empty)).toEqual(['chat'])
	})

	it('adds the plan once published and execution once approved', () => {
		expect(
			visiblePlanTabs({ ...empty, plan: { ...plan, title: 'x', approvedAt: '2026-01-01T00:00:00Z' }, slices: [slice] })
		).toEqual(['chat', 'plan', 'execution'])
	})

	it('adds changes once a bullet commits', () => {
		expect(visiblePlanTabs({ ...empty, build, runs: [run({ status: 'done', commitSha: 'abc' })] })).toContain('changes')
	})

	it('adds sync, right after changes, once the plan has an integration', () => {
		const integration = {} as unknown as Integration
		expect(visiblePlanTabs({ ...empty, integrations: [integration] })).toEqual(['chat', 'changes', 'sync'])
		expect(visiblePlanTabs(empty)).not.toContain('sync')
	})

	// A drive that is only queued has nothing to show yet; one that started does.
	it('adds verification once a drive starts, not when it is only pending', () => {
		expect(visiblePlanTabs({ ...empty, build, runs: [run({ phase: 'drive' })] })).not.toContain('verification')
		expect(visiblePlanTabs({ ...empty, build, runs: [run({ phase: 'drive', status: 'running' })] })).toContain('verification')
	})
})

describe('defaultPlanTab', () => {
	it.each([
		['drafting', ['chat', 'plan'], 'chat'],
		['needs_approval', ['chat', 'plan'], 'plan'],
		['building', ['chat', 'plan', 'execution'], 'execution'],
		['in_review', ['chat', 'plan', 'execution', 'changes', 'verification'], 'verification'],
		['in_review', ['chat', 'plan', 'execution', 'changes'], 'changes']
	] as const)('opens %s on the tab its state makes relevant', (state, tabs, expected) => {
		expect(defaultPlanTab({ state, tabs: [...tabs] })).toBe(expected)
	})
})
