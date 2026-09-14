import type { EnvSetSummary, PlainVar } from '~/entities/machine'
import type { OnboardingRequirement } from '~/entities/repository'

export interface RequiredKey {
	key: string
	why: string
	evidence: string
	stored: boolean
	missing: boolean
}

export interface RequiredInputs {
	envPaths: { path: string, keys: RequiredKey[] }[]
	secrets: RequiredKey[]
	policy: { why: string, evidence: string, missing: boolean } | null
}

// Typed values, keyed by path then key for env and by key for secrets. An empty
// string is "not typed": a required input is never satisfied by nothing.
export interface InputsDraft {
	env: Record<string, Record<string, string>>
	secrets: Record<string, string>
}

export interface InputWrites {
	envSets: { path: string, vars: PlainVar[] }[]
	sessionSecrets: PlainVar[] | null
}

function isMissing (missing: OnboardingRequirement[], requirement: OnboardingRequirement): boolean {
	return missing.some(
		(entry) => entry.kind === requirement.kind && entry.key === requirement.key && entry.path === requirement.path
	)
}

export function requiredInputs (opts: {
	requirements: OnboardingRequirement[],
	missing: OnboardingRequirement[],
	envSets: EnvSetSummary[],
	sessionSecrets: string[]
}): RequiredInputs {
	const envPaths = new Map<string, RequiredKey[]>()
	const secrets: RequiredKey[] = []
	let policy: RequiredInputs['policy'] = null

	for (const requirement of opts.requirements) {
		const base = { key: requirement.key, why: requirement.why, evidence: requirement.evidence, missing: isMissing(opts.missing, requirement) }

		if (requirement.kind === 'policy') {
			policy = { why: requirement.why, evidence: requirement.evidence, missing: base.missing }
		} else if (requirement.kind === 'secret') {
			secrets.push({ ...base, stored: opts.sessionSecrets.includes(requirement.key) })
		} else {
			const path = requirement.path ?? '.'
			const stored = opts.envSets.find((set) => set.path === path)?.keys.includes(requirement.key) ?? false

			envPaths.set(path, [...(envPaths.get(path) ?? []), { ...base, stored }])
		}
	}

	return {
		envPaths: [...envPaths].map(([path, keys]) => ({ path, keys })),
		secrets,
		policy
	}
}

function typedEntries (values: Record<string, string> | undefined): [string, string][] {
	return Object.entries(values ?? {}).filter(([, value]) => value !== '')
}

// A save replaces the machine's whole set for a path, and whole secret list, so
// every key already held is carried as null — keep what is stored. Leaving one
// out would delete a value nobody can type back in from here.
export function inputWrites (opts: {
	draft: InputsDraft,
	envSets: EnvSetSummary[],
	sessionSecrets: string[]
}): InputWrites {
	const envSets = Object.keys(opts.draft.env).flatMap((path) => {
		const typed = typedEntries(opts.draft.env[path])

		if (typed.length === 0) {
			return []
		}

		const values = new Map(typed)
		const kept = (opts.envSets.find((set) => set.path === path)?.keys ?? [])
			.filter((key) => !values.has(key))
			.map((key) => ({ key, value: null }))

		return [{ path, vars: [...kept, ...typed.map(([key, value]) => ({ key, value }))] }]
	})

	const typedSecrets = typedEntries(opts.draft.secrets)
	const typedNames = new Set(typedSecrets.map(([key]) => key))

	return {
		envSets,
		sessionSecrets:
			typedSecrets.length === 0
				? null
				: [
					...opts.sessionSecrets.filter((key) => !typedNames.has(key)).map((key) => ({ key, value: null })),
					...typedSecrets.map(([key, value]) => ({ key, value }))
				]
	}
}
