import { z } from 'zod'

import type { PlainVar } from '~/entities/machine'

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const SINGLE_LINE = /^[^\r\n]*$/

export const EnvPairSchema = z.object({
	id: z.string(),
	key: z.string().regex(ENV_KEY, 'Letters, digits and _, not starting with a digit'),
	value: z.string().regex(SINGLE_LINE, 'A value must fit on one line'),
	stored: z.boolean(),
	// Raised by onboarding: its key is fixed and the pair cannot be removed.
	required: z.boolean()
})

export type EnvPair = z.infer<typeof EnvPairSchema>

const PairsSchema = z.array(EnvPairSchema).superRefine((pairs, ctx) => {
	const seen = new Set<string>()

	pairs.forEach((pair, index) => {
		if (seen.has(pair.key)) {
			ctx.addIssue({ code: 'custom', path: [index, 'key'], message: `${pair.key} is already in this set` })
		}

		seen.add(pair.key)
	})
})

export const EnvSetFormSchema = z.object({
	path: z.string().trim().min(1, 'Path is required'),
	pairs: PairsSchema.refine((pairs) => pairs.length > 0, 'Add at least one pair')
})

export type EnvSetForm = z.infer<typeof EnvSetFormSchema>

// Inline editing of a known set: the path is fixed by the tab it sits on, and a
// list may be emptied, which for session secrets is how the last one goes.
export const VarsFormSchema = z.object({
	path: z.string(),
	pairs: PairsSchema
})

// Plaintext, and never sent as it is: the save seals every value first.
export interface EnvSetPayload {
	path: string
	vars: PlainVar[]
}

export type VarsTarget = { kind: 'env', path: string } | { kind: 'secrets' }

export interface RequiredVar {
	key: string
	why: string
	evidence: string
	missing: boolean
	optional: boolean
}
