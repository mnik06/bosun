import { z } from 'zod';

export const PlanProposalStatusSchema = z.enum(['open', 'started', 'dismissed']);

export type PlanProposalStatus = z.infer<typeof PlanProposalStatusSchema>;

export const PlanProposalSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	sourcePlanId: z.string(),
	buildId: z.string().nullable(),
	repositoryId: z.string().nullable(),
	title: z.string(),
	input: z.string(),
	status: PlanProposalStatusSchema,
	planId: z.string().nullable(),
	decidedByUserId: z.string().nullable(),
	decidedAt: z.date().nullable(),
	createdAt: z.date()
});

export type PlanProposal = z.infer<typeof PlanProposalSchema>;
