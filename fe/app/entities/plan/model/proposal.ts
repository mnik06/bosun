import { z } from 'zod'

export const PlanProposalSchema = z.object({
	id: z.string(),
	sourcePlanId: z.string(),
	sourcePlanNumber: z.number().int(),
	sourcePlanTitle: z.string().nullable(),
	repositoryId: z.string().nullable(),
	title: z.string(),
	input: z.string(),
	createdAt: z.iso.datetime()
})

export type PlanProposal = z.infer<typeof PlanProposalSchema>

export const PlanProposalListSchema = z.array(PlanProposalSchema)
