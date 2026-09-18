import { z } from 'zod';

// Imported by both unions, on the same terms as `plan-stream.ts`: a bug-fix
// session's frames travel from the agent and are forwarded to the browser
// unchanged. `sessionId` lets a frame from a session that already ended be told
// apart from the one currently live — the row flip, not the frame, is what is
// authoritative.
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

// Parsed from the pasted text, once per round. Carried as plain descriptions —
// the ids and ordering are for the backend to assign, the same way a plan's
// slices are.
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
