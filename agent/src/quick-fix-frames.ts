import { z } from 'zod';
import { CommitOutcomeSchema } from './commit-outcome';

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

export const QuickFixDoneMsgSchema = CommitOutcomeSchema.extend({
	type: z.literal('quickfix.done'),
	quickFixId: z.string()
});

export const QuickFixErrorMsgSchema = z.object({
	type: z.literal('quickfix.error'),
	quickFixId: z.string(),
	message: z.string()
});
