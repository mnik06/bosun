import type { EnvPair, RequiredVar } from '~/features/edit-env-sets/model/env-set-form'

export function blankPair (id: string): EnvPair {
	return { id, key: '', value: '', stored: false, required: false }
}

// Required keys lead, in the order onboarding raised them, so what is still
// missing sits at the top instead of wherever the machine happens to list it.
export function editorPairs (opts: {
	required: RequiredVar[],
	storedKeys: string[],
	newId: () => string
}): EnvPair[] {
	const stored = new Set(opts.storedKeys)
	const requiredKeys = [...new Set(opts.required.map((requirement) => requirement.key))]
	const pinned = new Set(requiredKeys)

	return [
		...requiredKeys.map((key) => ({ id: opts.newId(), key, value: '', stored: stored.has(key), required: true })),
		...opts.storedKeys
			.filter((key) => !pinned.has(key))
			.map((key) => ({ id: opts.newId(), key, value: '', stored: true, required: false }))
	]
}
