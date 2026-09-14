import { describe, expect, it } from 'vitest'

import type { MachineOnboarding, OnboardingRun } from '~/entities/repository'

import {
	setupChecklist,
	setupProgress,
	type ChecklistAction,
	type ChecklistInput,
	type ChecklistRowId,
	type ChecklistState
} from './checklist'

const green = [
	{ name: 'claude', ok: true, detail: 'credential present' },
	{ name: 'browser', ok: true, detail: 'chromium launches' }
]

const repository = { fullName: 'acme/app', configOnDefault: false, configDraft: null, defaultBranch: 'main' }

function run (overrides: Partial<OnboardingRun>): OnboardingRun {
	return {
		id: 'onb_1',
		repositoryId: 'repo_1',
		machineId: 'm_1',
		phase: 'discover',
		status: 'discovering',
		portBase: 4200,
		steps: [],
		requirements: [],
		assumptions: [],
		config: null,
		failureReason: null,
		startedAt: '2026-09-14T00:00:00.000Z',
		finishedAt: null,
		...overrides
	}
}

function onboarding (runOverrides: Partial<OnboardingRun>, missing: MachineOnboarding['missing'] = []): MachineOnboarding {
	return { run: run(runOverrides), missing }
}

function states (input: ChecklistInput): Record<ChecklistRowId, [ChecklistState, ChecklistAction]> {
	return Object.fromEntries(setupChecklist(input).map((row) => [row.id, [row.state, row.action]])) as Record<
		ChecklistRowId,
		[ChecklistState, ChecklistAction]
	>
}

describe('setupChecklist', () => {
	it('sends a freshly enrolled machine to the box, then to attaching a repository', () => {
		expect(
			states({ machine: { status: 'online', capabilities: [{ name: 'claude', ok: false }], repositoryId: null }, repository: null, onboarding: null })
		).toEqual({
			agent: ['done', null],
			claude: ['todo', 'run-setup'],
			browser: ['blocked', null],
			repository: ['todo', 'attach-repository'],
			config: ['blocked', null],
			inputs: ['blocked', null],
			verified: ['blocked', null]
		})
	})

	it('tells an offline agent to be started', () => {
		expect(states({ machine: { status: 'offline', capabilities: green, repositoryId: 'repo_1' }, repository, onboarding: null }).agent)
			.toEqual(['todo', 'start-agent'])
	})

	it('offers onboarding to an attached repository with no config, and follows discovery', () => {
		const machine = { status: 'online' as const, capabilities: green, repositoryId: 'repo_1' }

		expect(states({ machine, repository, onboarding: null }).config).toEqual(['todo', 'start-onboarding'])
		expect(states({ machine, repository, onboarding: onboarding({ status: 'discovering' }) }).config).toEqual(['running', null])
		expect(states({ machine, repository, onboarding: onboarding({ status: 'failed', failureReason: 'no config' }) }).config)
			.toEqual(['failed', 'start-onboarding'])
	})

	it('asks for inputs while any are missing, and waits for them before verify', () => {
		const missing = [{ kind: 'env' as const, path: 'be', key: 'DATABASE_URL', why: 'db', evidence: 'be/.env.example' }]
		const result = states({
			machine: { status: 'online', capabilities: green, repositoryId: 'repo_1' },
			repository: { ...repository, configDraft: 'version: 1' },
			onboarding: onboarding({ status: 'needs_input' }, missing)
		})

		expect(result.config).toEqual(['done', null])
		expect(result.inputs).toEqual(['todo', 'provide-inputs'])
		expect(result.verified).toEqual(['blocked', null])
	})

	// A second machine on a repository that already has its file needs no
	// discovery at all: its own inputs and a verify.
	it('sends a second machine on an onboarded repository straight to verify', () => {
		const result = states({
			machine: { status: 'online', capabilities: green, repositoryId: 'repo_1' },
			repository: { ...repository, configOnDefault: true },
			onboarding: null
		})

		expect(result.config).toEqual(['done', null])
		expect(result.inputs).toEqual(['todo', 'run-verify'])
	})

	it('counts a verified machine as finished', () => {
		const rows = setupChecklist({
			machine: { status: 'online', capabilities: green, repositoryId: 'repo_1' },
			repository: { ...repository, configOnDefault: true },
			onboarding: onboarding({ phase: 'verify', status: 'ready' })
		})

		expect(setupProgress(rows)).toEqual({ done: 7, total: 7 })
	})

	it('offers verify again after a failed verify', () => {
		expect(
			states({
				machine: { status: 'online', capabilities: green, repositoryId: 'repo_1' },
				repository: { ...repository, configDraft: 'version: 1' },
				onboarding: onboarding({ phase: 'verify', status: 'failed', failureReason: 'be did not answer' })
			}).verified
		).toEqual(['failed', 'run-verify'])
	})
})
