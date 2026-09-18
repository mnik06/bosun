import { z } from 'zod';
import { ChatAttachmentSchema } from './chat-attachment';

// Mirrors `be/src/types/bugfix-frames.ts` and `be/src/types/bugfix-stream.ts`.

export const BugfixStartMsgSchema = z.object({
	type: z.literal('bugfix.start'),
	sessionId: z.string(),
	buildId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	planNumber: z.number().int(),
	planTitle: z.string(),
	planBodyMd: z.string(),
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	text: z.string(),
	attachments: z.array(ChatAttachmentSchema).default([])
});

export type BugfixStart = z.infer<typeof BugfixStartMsgSchema>;

export const BugfixSayMsgSchema = z.object({
	type: z.literal('bugfix.say'),
	sessionId: z.string(),
	buildId: z.string(),
	text: z.string(),
	attachments: z.array(ChatAttachmentSchema).default([])
});

export type BugfixSay = z.infer<typeof BugfixSayMsgSchema>;

export const BugfixCancelMsgSchema = z.object({
	type: z.literal('bugfix.cancel'),
	sessionId: z.string(),
	buildId: z.string()
});

export const BugfixTextMsgSchema = z.object({
	type: z.literal('bugfix.text'),
	sessionId: z.string(),
	buildId: z.string(),
	delta: z.string()
});

export const BugfixActivityMsgSchema = z.object({
	type: z.literal('bugfix.activity'),
	sessionId: z.string(),
	buildId: z.string(),
	label: z.string()
});

// Declared for parity with the backend's union, which still carries this
// shape — this bullet reports parsed bugs over the synchronous `/agent/builds/:buildId/bugs`
// request instead (see `bugfix/mcp/tools.ts`), because the orchestrator needs the
// assigned ids back in the same turn to reference them from `update_bug_status`,
// and a fire-and-forget frame cannot answer that. Nothing on the agent side emits
// this frame.
export const BugfixBugsMsgSchema = z.object({
	type: z.literal('bugfix.bugs'),
	sessionId: z.string(),
	buildId: z.string(),
	descriptions: z.array(z.string()).min(1)
});

export const BugfixDoneMsgSchema = z.object({
	type: z.literal('bugfix.done'),
	sessionId: z.string(),
	buildId: z.string()
});

export const BugfixErrorMsgSchema = z.object({
	type: z.literal('bugfix.error'),
	sessionId: z.string(),
	buildId: z.string(),
	message: z.string()
});
