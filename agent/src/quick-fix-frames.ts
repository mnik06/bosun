import { z } from 'zod';

// Mirrors `be/src/types/quick-fix-frames.ts`. Kept out of `protocol.ts` only for its length.

export const QuickFixStartMsgSchema = z.object({
	type: z.literal('quickfix.start'),
	quickFixId: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	description: z.string(),
	memoryMaxBytes: z.number().int().positive().nullable()
});

export type QuickFixStart = z.infer<typeof QuickFixStartMsgSchema>;

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
