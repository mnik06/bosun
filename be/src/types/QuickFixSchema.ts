import { z } from 'zod';

export const QuickFixStatusSchema = z.enum(['running', 'pushed', 'failed']);

export type QuickFixStatus = z.infer<typeof QuickFixStatusSchema>;

// A one-shot bug fix outside the line entirely: no plan, no board card, no ACs, no
// tracer bullets. This row is the whole system of record for it.
export const QuickFixSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	machineId: z.string(),
	repositoryId: z.string(),
	branch: z.string(),
	baseBranch: z.string(),
	description: z.string(),
	status: QuickFixStatusSchema,
	prUrl: z.string().nullable(),
	error: z.string().nullable(),
	createdByUserId: z.string().nullable(),
	createdAt: z.date(),
	finishedAt: z.date().nullable()
});

export type QuickFix = z.infer<typeof QuickFixSchema>;
