import { z } from 'zod';
import { ChatAttachmentSchema } from 'src/types/ChatAttachmentSchema';

// Everything the session needs to spawn its long-lived `claude` process in the
// build's existing worktree: nothing here is fetched by the agent, the same
// choice `exec.start` makes so a reconnect can resend this frame unchanged. The
// one exception is an attached file's bytes, fetched by id over
// `/agent/attachments/:id` — still resendable, since the row outlives the frame.
// Held off the socket because a frame is one write, and 20 MB of base64 queued
// ahead of the heartbeat's ping is a machine marked dead for being busy.
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

// A later message to the same live process, including one sent while the
// orchestrator is mid-round — delivered as the next input rather than refused.
export const BugfixSayMsgSchema = z.object({
	type: z.literal('bugfix.say'),
	sessionId: z.string(),
	buildId: z.string(),
	text: z.string(),
	attachments: z.array(ChatAttachmentSchema).default([])
});

export const BugfixCancelMsgSchema = z.object({
	type: z.literal('bugfix.cancel'),
	sessionId: z.string(),
	buildId: z.string()
});
