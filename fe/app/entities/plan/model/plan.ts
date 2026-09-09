import { z } from 'zod'

export const PlanStatusSchema = z.enum(['planning', 'ready', 'failed'])

export type PlanStatus = z.infer<typeof PlanStatusSchema>

export const PlanSchema = z.object({
	id: z.string(),
	userId: z.string(),
	machineId: z.string(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	number: z.number().int(),
	status: PlanStatusSchema,
	verifyInUi: z.boolean(),
	auto: z.boolean(),
	confirmedAt: z.iso.datetime().nullable(),
	failureReason: z.string().nullable(),
	input: z.string(),
	createdAt: z.iso.datetime()
})

export type Plan = z.infer<typeof PlanSchema>

export const PlanListSchema = z.array(PlanSchema)

export const PlanQuestionSchema = z.object({
	header: z.string(),
	question: z.string(),
	options: z.array(z.object({ label: z.string(), description: z.string() })),
	multiSelect: z.boolean()
})

export type PlanQuestion = z.infer<typeof PlanQuestionSchema>

export const PlanAnswerSchema = z.object({ selected: z.array(z.string()).min(1) })

export type PlanAnswer = z.infer<typeof PlanAnswerSchema>

const messageBase = {
	id: z.string(),
	planId: z.string(),
	seq: z.number(),
	createdAt: z.iso.datetime()
}

const TextContentSchema = z.object({ text: z.string() })

export const PlanMessageSchema = z.discriminatedUnion('role', [
	z.object({ ...messageBase, role: z.literal('user'), content: TextContentSchema }),
	z.object({ ...messageBase, role: z.literal('assistant'), content: TextContentSchema }),
	z.object({ ...messageBase, role: z.literal('activity'), content: z.object({ label: z.string() }) }),
	z.object({
		...messageBase,
		role: z.literal('question'),
		content: z.object({ questionId: z.string(), questions: z.array(PlanQuestionSchema) })
	}),
	z.object({
		...messageBase,
		role: z.literal('answer'),
		content: z.object({ questionId: z.string(), answers: z.array(PlanAnswerSchema) })
	})
])

export type PlanMessage = z.infer<typeof PlanMessageSchema>

export const AcSchema = z.object({
	id: z.string(),
	planId: z.string(),
	code: z.string(),
	text: z.string(),
	sliceId: z.string().nullable(),
	ordinal: z.number(),
	implemented: z.boolean(),
	verified: z.boolean()
})

export type Ac = z.infer<typeof AcSchema>

export const SliceKindSchema = z.enum(['build', 'verify'])

export type SliceKind = z.infer<typeof SliceKindSchema>

export const SliceSchema = z.object({
	id: z.string(),
	planId: z.string(),
	ordinal: z.number(),
	kind: SliceKindSchema,
	title: z.string(),
	bodyMd: z.string().nullable()
})

export type Slice = z.infer<typeof SliceSchema>

export const PlanDecisionSchema = z.object({
	id: z.string(),
	planId: z.string(),
	sliceId: z.string().nullable(),
	fork: z.string(),
	options: z.string().nullable(),
	chose: z.string(),
	blastRadius: z.string().nullable(),
	reversing: z.string().nullable(),
	createdAt: z.coerce.date()
})

export type PlanDecision = z.infer<typeof PlanDecisionSchema>

export const PlanDetailSchema = z.object({
	plan: PlanSchema,
	messages: z.array(PlanMessageSchema),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema),
	blockedBy: z.array(PlanSchema),
	decisions: z.array(PlanDecisionSchema)
})

export type PlanDetail = z.infer<typeof PlanDetailSchema>
