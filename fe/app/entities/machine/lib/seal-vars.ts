import { seal, type SealedValue } from '~/shared/lib'

export interface PlainVar {
	key: string
	value: string | null
}

export interface SealedVar {
	key: string
	value: SealedValue | null
}

export const AGENT_TOO_OLD_FOR_INPUTS =
	'This machine\'s agent is too old to receive values from the browser — upgrade it with Refresh.'

// Refused rather than sent in the clear: a machine that published no key is one
// whose agent cannot open an envelope, and a plaintext fallback is the very
// request body the sealing exists to keep out of logs.
export async function sealVars (opts: {
	publicKey: string | null | undefined,
	vars: PlainVar[]
}): Promise<SealedVar[]> {
	const publicKey = opts.publicKey

	if (publicKey == null) {
		throw new Error(AGENT_TOO_OLD_FOR_INPUTS)
	}

	return Promise.all(
		opts.vars.map(async (entry) => ({
			key: entry.key,
			value: entry.value === null ? null : await seal(publicKey, entry.value)
		}))
	)
}
