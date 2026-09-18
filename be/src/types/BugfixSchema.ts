import { z } from 'zod';
import { ChatAttachmentSchema } from 'src/types/ChatAttachmentSchema';

export const BugfixSessionStatusSchema = z.enum(['running', 'closed']);

export type BugfixSessionStatus = z.infer<typeof BugfixSessionStatusSchema>;

export const BugfixSessionEndedReasonSchema = z.enum(['user_closed', 'idle_timeout', 'merged', 'cancelled', 'error']);

export type BugfixSessionEndedReason = z.infer<typeof BugfixSessionEndedReasonSchema>;

// One row per build, unique while running: the claim a session holds on the
// build's worktree, so an integration or another bug-fix session can never
// write it at the same time. The build's own status transition is the actual
// gate — this row is the history and the thing `report_bugs`/`update_bug_status`
// are gated against, not itself race-guarded.
export const BugfixSessionSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	status: BugfixSessionStatusSchema,
	endedReason: BugfixSessionEndedReasonSchema.nullable(),
	startedByUserId: z.string().nullable(),
	createdAt: z.coerce.date(),
	endedAt: z.coerce.date().nullable()
});

export type BugfixSession = z.infer<typeof BugfixSessionSchema>;

export const PlanBugStatusSchema = z.enum(['pending', 'fixing', 'fixed', 'failed']);

export type PlanBugStatus = z.infer<typeof PlanBugStatusSchema>;

// Keyed by build, not by session: a later round's pasted bugs append to the
// same list, spanning any number of sessions on that build.
export const PlanBugSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	seq: z.number().int(),
	description: z.string(),
	status: PlanBugStatusSchema,
	note: z.string().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export type PlanBug = z.infer<typeof PlanBugSchema>;

export const BugfixMessageRoleSchema = z.enum(['user', 'assistant', 'system']);

export type BugfixMessageRole = z.infer<typeof BugfixMessageRoleSchema>;

// `attachments` is only ever set on a person's own turn, and is optional on the
// same terms as a plan chat's user turn.
export const BugfixMessageContentSchema = z.object({
	text: z.string(),
	attachments: z.array(ChatAttachmentSchema).optional()
});

export type BugfixMessageContent = z.infer<typeof BugfixMessageContentSchema>;

export const BugfixMessageSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	seq: z.number().int(),
	role: BugfixMessageRoleSchema,
	content: BugfixMessageContentSchema,
	createdAt: z.coerce.date()
});

export type BugfixMessage = z.infer<typeof BugfixMessageSchema>;
