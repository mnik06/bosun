import { z } from 'zod';

// Starts a one-shot fix session with no plan behind it: a branch, a base ref and a
// bug description, none of the plan/slice/AC shape `exec.start` carries. The
// session it starts is deliberately non-interactive — there is no `quickfix.answer`
// — so a fix that cannot be produced reports `quickfix.error` instead of asking.
export const QuickFixStartMsgSchema = z.object({
	type: z.literal('quickfix.start'),
	quickFixId: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	description: z.string(),
	// The most memory this session may use, on the same terms as `exec.start`.
	memoryMaxBytes: z.number().int().positive().nullable()
});

// Mirrors `exec.done`'s shape minus everything that makes a bullet part of a
// plan: no AC gating, because a quick fix has no criteria to score against.
export const QuickFixDoneMsgSchema = z.object({
	type: z.literal('quickfix.done'),
	quickFixId: z.string(),
	commitSha: z.string().nullable(),
	report: z.string(),
	changedFiles: z.array(z.string()).default([]),
	pushed: z.boolean().default(false),
	pushError: z.string().nullable().default(null)
});

export const QuickFixErrorMsgSchema = z.object({
	type: z.literal('quickfix.error'),
	quickFixId: z.string(),
	message: z.string()
});
