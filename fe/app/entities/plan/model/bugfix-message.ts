import { z } from 'zod'

import { BugfixMessageSchema } from '~/entities/plan/model/bugfix'

// Rides the plan's existing `plan.subscribe` channel: a bug-fixing session has no
// subscription of its own, and every socket watching a build's plan is already
// watching the one build it can have live at a time. Frames carry `buildId`, not
// `planId`, since `plan_bugs`/`bugfix_messages` are scoped to the build.
export const BugfixUiMsgSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('bugfix.text'), sessionId: z.string(), buildId: z.string(), delta: z.string() }),
	z.object({ type: z.literal('bugfix.activity'), sessionId: z.string(), buildId: z.string(), label: z.string() }),
	// Declared for wire parity with the backend's schema but never emitted by a
	// live session: a round's parsed bugs are picked up by refetching the bug
	// list on the `plan.changed` nudge instead.
	z.object({
		type: z.literal('bugfix.bugs'),
		sessionId: z.string(),
		buildId: z.string(),
		descriptions: z.array(z.string())
	}),
	z.object({ type: z.literal('bugfix.done'), sessionId: z.string(), buildId: z.string() }),
	z.object({ type: z.literal('bugfix.error'), sessionId: z.string(), buildId: z.string(), message: z.string() }),
	z.object({ type: z.literal('bugfix.message'), buildId: z.string(), message: BugfixMessageSchema })
])

export type BugfixUiMsg = z.infer<typeof BugfixUiMsgSchema>
