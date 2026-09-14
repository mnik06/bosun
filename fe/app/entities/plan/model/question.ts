import { z } from 'zod'

export const PlanQuestionSchema = z.object({
	header: z.string(),
	question: z.string(),
	options: z.array(z.object({ label: z.string(), description: z.string() })),
	multiSelect: z.boolean()
})

export type PlanQuestion = z.infer<typeof PlanQuestionSchema>

// One entry per question in the same order, so an answer needs no key back to the
// question it belongs to and cannot be paired with the wrong one.
export const PlanAnswerSchema = z.object({ selected: z.array(z.string()).min(1) })

export type PlanAnswer = z.infer<typeof PlanAnswerSchema>
