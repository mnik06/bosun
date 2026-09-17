import { z } from 'zod'

export const PlanBugStatusSchema = z.enum(['pending', 'fixing', 'fixed', 'failed'])

export type PlanBugStatus = z.infer<typeof PlanBugStatusSchema>

// Keyed by build, not by session: a later round's pasted bugs append to the
// same list, spanning any number of sessions on that build.
export const PlanBugSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	seq: z.number(),
	description: z.string(),
	status: PlanBugStatusSchema,
	note: z.string().nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime()
})

export type PlanBug = z.infer<typeof PlanBugSchema>

export const BugfixMessageRoleSchema = z.enum(['user', 'assistant', 'system'])

export type BugfixMessageRole = z.infer<typeof BugfixMessageRoleSchema>

export const BugfixMessageSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	seq: z.number(),
	role: BugfixMessageRoleSchema,
	content: z.object({ text: z.string() }),
	createdAt: z.iso.datetime()
})

export type BugfixMessage = z.infer<typeof BugfixMessageSchema>
