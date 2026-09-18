import { z } from 'zod'

import { ChatAttachmentSchema } from '~/entities/plan/model/chat-attachment'

export const PlanBugStatusSchema = z.enum(['pending', 'fixing', 'fixed', 'failed'])

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

export const BugfixMessageSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	seq: z.number(),
	role: BugfixMessageRoleSchema,
	content: z.object({ text: z.string(), attachments: z.array(ChatAttachmentSchema).default([]) }),
	createdAt: z.iso.datetime()
})

export type BugfixMessage = z.infer<typeof BugfixMessageSchema>
