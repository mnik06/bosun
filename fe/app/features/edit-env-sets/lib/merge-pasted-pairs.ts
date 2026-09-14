import type { EnvPair } from '~/features/edit-env-sets/model/env-set-form'

// A pasted key the form already has takes the pasted value in place, so a key
// the machine stores is replaced rather than listed twice and refused on save.
// Blank rows are dropped: pasting into a fresh set should not leave the empty
// pair it opened with sitting above the file.
export function mergePastedPairs (opts: {
	pairs: EnvPair[],
	vars: { key: string, value: string }[],
	newId: () => string
}): EnvPair[] {
	const merged = opts.pairs
		.filter((pair) => pair.stored || pair.key.trim() !== '' || pair.value !== '')
		.map((pair) => ({ ...pair }))

	for (const envVar of opts.vars) {
		const existing = merged.find((pair) => pair.key === envVar.key)

		if (existing === undefined) {
			merged.push({ id: opts.newId(), key: envVar.key, value: envVar.value, stored: false, required: false })
		} else {
			existing.value = envVar.value
		}
	}

	return merged.length === 0 ? opts.pairs : merged
}
