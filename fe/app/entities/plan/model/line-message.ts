import { z } from 'zod'

import { BuildSchema } from '~/entities/plan/model/build'
import { PlanDecisionSchema, PlanQuestionSchema } from '~/entities/plan/model/plan'

export const LineUiMsgSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('build.updated'), build: BuildSchema }),
	z.object({ type: z.literal('build.deleted'), buildId: z.string(), planId: z.string() }),
	z.object({ type: z.literal('line.changed'), repositoryId: z.string() }),
	z.object({ type: z.literal('plan.changed'), planId: z.string() }),
	z.object({ type: z.literal('needs_you.changed') }),
	z.object({
		type: z.literal('run.question'),
		runId: z.string(),
		planId: z.string(),
		questionId: z.string(),
		questions: z.array(PlanQuestionSchema)
	}),
	z.object({ type: z.literal('run.activity'), runId: z.string(), label: z.string() }),
	z.object({
		type: z.literal('integration.activity'),
		integrationId: z.string(),
		planId: z.string(),
		label: z.string()
	}),
	z.object({ type: z.literal('plan.decision'), planId: z.string(), decision: PlanDecisionSchema })
])

export type LineUiMsg = z.infer<typeof LineUiMsgSchema>
