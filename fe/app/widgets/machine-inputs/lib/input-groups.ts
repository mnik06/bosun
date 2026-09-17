import type { EnvSetSummary } from '~/entities/machine'
import type { OnboardingRequirement } from '~/entities/repository'
import type { RequiredVar } from '~/features/edit-env-sets'
import { stripSlashes } from '~/shared/lib'

export interface VarsGroup {
	required: RequiredVar[]
	storedKeys: string[]
	missing: number
}

interface EnvGroup extends VarsGroup {
	path: string
	updatedAt: string | null
}

export interface InputGroups {
	envs: EnvGroup[]
	secrets: VarsGroup
	policy: { why: string, missing: boolean } | null
}

const ROOT = '.'

export function normalizeEnvPath (path: string): string {
	const relative = stripSlashes(path)

	return relative === '' ? ROOT : relative
}

function isMissing (missing: OnboardingRequirement[], requirement: OnboardingRequirement): boolean {
	return missing.some(
		(entry) => entry.kind === requirement.kind && entry.key === requirement.key && entry.path === requirement.path
	)
}

function varsGroup (required: RequiredVar[], storedKeys: string[]): VarsGroup {
	return { required, storedKeys, missing: required.filter((requirement) => requirement.missing).length }
}

// One tab per env path the machine holds, onboarding asked for, or the person
// just added — a path appears once whichever of those it came from, and the
// ones onboarding raised come first.
export function inputGroups (opts: {
	requirements: OnboardingRequirement[],
	missing: OnboardingRequirement[],
	envSets: EnvSetSummary[],
	sessionSecrets: string[],
	addedPaths: string[]
}): InputGroups {
	const envRequired = new Map<string, RequiredVar[]>()
	const secrets: RequiredVar[] = []
	let policy: InputGroups['policy'] = null

	for (const requirement of opts.requirements) {
		const required = {
			key: requirement.key,
			why: requirement.why,
			evidence: requirement.evidence,
			missing: isMissing(opts.missing, requirement),
			optional: requirement.optional
		}

		if (requirement.kind === 'policy') {
			policy = { why: requirement.why, missing: required.missing }
		} else if (requirement.kind === 'secret') {
			secrets.push(required)
		} else {
			const path = normalizeEnvPath(requirement.path ?? ROOT)

			envRequired.set(path, [...(envRequired.get(path) ?? []), required])
		}
	}

	const stored = new Map(opts.envSets.map((set) => [normalizeEnvPath(set.path), set]))
	const paths = new Set([...envRequired.keys(), ...stored.keys(), ...opts.addedPaths.map(normalizeEnvPath)])

	return {
		envs: [...paths].map((path) => ({
			path,
			updatedAt: stored.get(path)?.updatedAt ?? null,
			...varsGroup(envRequired.get(path) ?? [], stored.get(path)?.keys ?? [])
		})),
		secrets: varsGroup(secrets, opts.sessionSecrets),
		policy
	}
}
