import { z } from 'zod';

// Everything the session needs to spawn its long-lived `claude` process in the
// build's existing worktree: nothing here is fetched by the agent, the same
// choice `exec.start` makes so a reconnect can resend this frame unchanged.
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
	text: z.string()
});

// A later message to the same live process, including one sent while the
// orchestrator is mid-round — delivered as the next input rather than refused.
export const BugfixSayMsgSchema = z.object({
	type: z.literal('bugfix.say'),
	sessionId: z.string(),
	buildId: z.string(),
	text: z.string()
});

export const BugfixCancelMsgSchema = z.object({
	type: z.literal('bugfix.cancel'),
	sessionId: z.string(),
	buildId: z.string()
});
