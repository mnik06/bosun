import type { EnvSetForm, EnvSetPayload } from '~/features/edit-env-sets/model/env-set-form'

// An empty value on a key the machine already holds means "leave it alone".
// Sending '' instead would overwrite a secret nobody can read back with nothing.
// A required key nobody has typed yet is left out rather than stored empty: an
// empty value would count as provided and hide that it is still missing.
export function toEnvSetPayload (form: EnvSetForm): EnvSetPayload {
	return {
		path: form.path.trim(),
		vars: form.pairs
			.filter((pair) => pair.stored || !pair.required || pair.value !== '')
			.map((pair) => ({
				key: pair.key,
				value: pair.stored && pair.value === '' ? null : pair.value
			}))
	}
}
