import { z } from 'zod'

export interface Session {
	userId: string
	email: string
}

export type SessionState =
	| { status: 'loading', session: null }
	| { status: 'anonymous', session: null }
	| { status: 'authenticated', session: Session }

// The account as the backend knows it, which is where `isAppOwner` lives — the
// Supabase session says who signed in, not what they are allowed to do here.
export const MeSchema = z.object({
	id: z.string(),
	email: z.email(),
	isAppOwner: z.boolean(),
	createdAt: z.iso.datetime()
})

export type Me = z.infer<typeof MeSchema>
