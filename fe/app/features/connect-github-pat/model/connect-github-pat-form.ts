import { z } from 'zod'

const FINE_GRAINED_PREFIX = 'github_pat_'

// Mirrors `detectGithubTokenKind` in be/src/types/GithubPatSchema.ts — used here
// only to decide what the form shows and gates, never to validate the token
// itself, which the backend still does against GitHub on submit.
export function detectGithubTokenKind (pat: string): 'fine_grained' | 'classic' {
	return pat.startsWith(FINE_GRAINED_PREFIX) ? 'fine_grained' : 'classic'
}

export const ConnectGithubPatFormSchema = z
	.object({
		pat: z.string().min(1, 'Enter a personal access token'),
		confirmedClassicScope: z.boolean()
	})
	.refine((values) => detectGithubTokenKind(values.pat) !== 'classic' || values.confirmedClassicScope, {
		message: 'Confirm you understand what a classic token can reach',
		path: ['confirmedClassicScope']
	})

export type ConnectGithubPatForm = z.infer<typeof ConnectGithubPatFormSchema>

export const RotateGithubPatFormSchema = z.object({
	pat: z.string().min(1, 'Enter a personal access token')
})

export type RotateGithubPatForm = z.infer<typeof RotateGithubPatFormSchema>
