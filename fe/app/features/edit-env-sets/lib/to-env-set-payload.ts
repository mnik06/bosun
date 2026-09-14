import type { EnvSetForm, EnvSetPayload } from '~/features/edit-env-sets/model/env-set-form'

// An empty value on a key the machine already holds means "leave it alone".
// Sending '' instead would overwrite a secret nobody can read back with nothing.
export function toEnvSetPayload (form: EnvSetForm): EnvSetPayload {
	return {
		path: form.path.trim(),
		vars: form.pairs.map((pair) => ({
			key: pair.key,
			value: pair.stored && pair.value === '' ? null : pair.value
		}))
	}
}
