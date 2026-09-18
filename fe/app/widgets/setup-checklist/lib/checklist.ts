import { repositoryCloning, type Machine, type PreflightCheck } from '~/entities/machine'
import { configSource, pendingBaseBranch, type MachineOnboarding, type Repository } from '~/entities/repository'

export type ChecklistRowId = 'agent' | 'claude' | 'browser' | 'repository' | 'config' | 'inputs' | 'verified'

export type ChecklistState = 'done' | 'todo' | 'running' | 'failed' | 'blocked'

// What fixes the row. A command where only the box can do it, a button where the
// browser can, nothing where the row is waiting on an earlier one.
export type ChecklistAction =
	| 'start-agent'
	| 'run-setup'
	| 'attach-repository'
	| 'start-onboarding'
	| 'choose-base-branch'
	| 'provide-inputs'
	| 'run-verify'
	| null

export interface ChecklistRow {
	id: ChecklistRowId
	label: string
	state: ChecklistState
	detail: string
	action: ChecklistAction
}

export interface ChecklistInput {
	machine: Pick<Machine, 'status' | 'capabilities' | 'repositoryId' | 'clonedRepositoryId'>
	repository: Pick<Repository, 'fullName' | 'configOnDefault' | 'configDraft' | 'defaultBranch'> | null
	onboarding: MachineOnboarding | null
}

type Row = Omit<ChecklistRow, 'id' | 'label'>

function connected (machine: ChecklistInput['machine']): boolean {
	return machine.status === 'online' || machine.status === 'paused'
}

function checkRow (checks: PreflightCheck[] | null, name: string): Row {
	const check = checks?.find((entry) => entry.name === name)

	if (check === undefined) {
		return { state: 'blocked', detail: 'waiting for the agent to report preflight', action: null }
	}

	return check.ok
		? { state: 'done', detail: check.detail ?? 'ok', action: null }
		: { state: 'todo', detail: check.detail ?? 'failed', action: 'run-setup' }
}

function repositoryRow ({ machine, repository }: ChecklistInput): Row {
	if (machine.repositoryId == null) {
		return { state: 'todo', detail: 'none attached', action: 'attach-repository' }
	}

	return repositoryCloning(machine)
		? { state: 'running', detail: `cloning ${repository?.fullName ?? 'the repository'} on the machine`, action: null }
		: { state: 'done', detail: repository?.fullName ?? 'attached', action: null }
}

function configRow ({ machine, repository, onboarding }: ChecklistInput): Row {
	if (machine.repositoryId == null) {
		return { state: 'blocked', detail: 'attach a repository first', action: null }
	}

	if (repositoryCloning(machine)) {
		return { state: 'blocked', detail: 'waiting for the clone', action: null }
	}

	// Ahead of the draft: discovery has published one, but for another branch than
	// the one verify would run it on.
	const suggested = pendingBaseBranch({ run: onboarding?.run, repository })

	if (suggested !== null) {
		return { state: 'todo', detail: `written for ${suggested} — make it the base branch`, action: 'choose-base-branch' }
	}

	const source = repository === null ? 'none' : configSource(repository)

	if (source === 'file') {
		return { state: 'done', detail: `.bosun/project.yaml on ${repository?.defaultBranch ?? 'the default branch'}`, action: null }
	}

	if (source === 'draft') {
		return { state: 'done', detail: 'bosun draft', action: null }
	}

	const run = onboarding?.run

	if (run?.status === 'discovering') {
		return { state: 'running', detail: 'discovery is reading the repository', action: null }
	}

	if (run?.status === 'failed') {
		return { state: 'failed', detail: run.failureReason ?? 'discovery failed', action: 'start-onboarding' }
	}

	return { state: 'todo', detail: 'onboarding writes one from the repository', action: 'start-onboarding' }
}

function hasConfig (repository: ChecklistInput['repository']): boolean {
	return repository !== null && configSource(repository) !== 'none'
}

function inputsRow ({ repository, onboarding }: ChecklistInput): Row {
	const run = onboarding?.run

	if (onboarding === null || run === undefined) {
		return hasConfig(repository)
			? { state: 'todo', detail: 'run verify to see what this machine needs', action: 'run-verify' }
			: { state: 'blocked', detail: 'onboarding lists what this machine needs', action: null }
	}

	if (run.status === 'discovering') {
		return { state: 'blocked', detail: 'discovery is still listing them', action: null }
	}

	const missing = onboarding.missing.length

	return missing === 0
		? { state: 'done', detail: 'nothing missing', action: null }
		: { state: 'todo', detail: `${missing} still missing`, action: 'provide-inputs' }
}

function verifiedRow ({ repository, onboarding }: ChecklistInput): Row {
	const run = onboarding?.run

	switch (run?.status) {
		case 'ready':
			return { state: 'done', detail: 'installed, started and signed in', action: null }
		case 'verifying':
			return { state: 'running', detail: 'verify is running', action: null }
		case 'failed':
			return hasConfig(repository)
				? { state: 'failed', detail: run.failureReason ?? 'verify failed', action: 'run-verify' }
				: { state: 'blocked', detail: 'needs a config first', action: null }
		case 'needs_input':
			return pendingBaseBranch({ run, repository }) === null
				? { state: 'blocked', detail: 'starts once the inputs are in', action: null }
				: { state: 'blocked', detail: 'starts once the base branch is chosen', action: null }
		case 'discovering':
		case undefined:
			return { state: 'blocked', detail: 'runs after the inputs', action: null }
	}
}

export function setupChecklist (input: ChecklistInput): ChecklistRow[] {
	const { machine } = input

	return [
		{
			id: 'agent',
			label: 'Agent connected',
			...(connected(machine)
				? { state: 'done', detail: machine.status, action: null }
				: { state: 'todo', detail: 'the agent is not connected', action: 'start-agent' })
		},
		{ id: 'claude', label: 'Claude', ...checkRow(machine.capabilities, 'claude') },
		{ id: 'browser', label: 'Browser', ...checkRow(machine.capabilities, 'browser') },
		{
			id: 'repository',
			label: 'Repository',
			...repositoryRow(input)
		},
		{ id: 'config', label: 'Config', ...configRow(input) },
		{ id: 'inputs', label: 'Inputs', ...inputsRow(input) },
		{ id: 'verified', label: 'Verified', ...verifiedRow(input) }
	]
}

export function setupProgress (rows: ChecklistRow[]): { done: number, total: number } {
	return { done: rows.filter((row) => row.state === 'done').length, total: rows.length }
}
