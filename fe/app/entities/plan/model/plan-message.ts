import { z } from 'zod'

import {
	AcSchema,
	PlanMessageSchema,
	PlanQuestionSchema,
	PlanSchema,
	SliceSchema
} from '~/entities/plan/model/plan'

export const PlanUiMsgSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('plan.updated'), plan: PlanSchema }),
	z.object({ type: z.literal('plan.deleted'), planId: z.string() }),
	z.object({ type: z.literal('plan.text'), planId: z.string(), delta: z.string() }),
	z.object({ type: z.literal('plan.activity'), planId: z.string(), label: z.string() }),
	z.object({
		type: z.literal('plan.question'),
		planId: z.string(),
		questionId: z.string(),
		questions: z.array(PlanQuestionSchema)
	}),
	z.object({ type: z.literal('plan.done'), planId: z.string() }),
	z.object({ type: z.literal('plan.error'), planId: z.string(), message: z.string() }),
	z.object({
		type: z.literal('plan.message'),
		planId: z.string(),
		message: PlanMessageSchema
	}),
	z.object({
		type: z.literal('plan.artifact'),
		planId: z.string(),
		acs: z.array(AcSchema),
		slices: z.array(SliceSchema)
	})
])

export type PlanUiMsg = z.infer<typeof PlanUiMsgSchema>
