import { z } from 'zod'

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const SINGLE_LINE = /^[^\r\n]*$/

export const EnvPairSchema = z.object({
	id: z.string(),
	key: z.string().regex(ENV_KEY, 'Letters, digits and _, not starting with a digit'),
	value: z.string().regex(SINGLE_LINE, 'A value must fit on one line'),
	stored: z.boolean()
})

export type EnvPair = z.infer<typeof EnvPairSchema>

export const EnvSetFormSchema = z
	.object({
		path: z.string().trim().min(1, 'Path is required'),
		pairs: z.array(EnvPairSchema).min(1, 'Add at least one pair')
	})
	.superRefine((form, ctx) => {
		const seen = new Set<string>()

		form.pairs.forEach((pair, index) => {
			if (seen.has(pair.key)) {
				ctx.addIssue({
					code: 'custom',
					path: ['pairs', index, 'key'],
					message: `${pair.key} is already in this set`
				})
			}

			seen.add(pair.key)
		})
	})

export type EnvSetForm = z.infer<typeof EnvSetFormSchema>

export interface EnvSetPayload {
	path: string
	vars: { key: string, value: string | null }[]
}
