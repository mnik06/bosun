import { z } from 'zod'

export const PlanStatusSchema = z.enum(['planning', 'ready', 'failed'])

export type PlanStatus = z.infer<typeof PlanStatusSchema>

// What the plan is doing, derived by the backend from the plan row and its
// latest queue item. Optional because this app and the backend deploy
// separately; the badge falls back to the raw status until one has shipped.
export const PlanStateSchema = z.enum([
	'planning',
	'drafted',
	'confirmed',
	'queued',
	'running',
	'in_review',
	'failed'
])

export type PlanState = z.infer<typeof PlanStateSchema>

export const PlanSummaryEntrySchema = z.object({
	path: z.string(),
	kind: z.enum(['added', 'changed', 'removed']),
	note: z.string()
})

export type PlanSummaryEntry = z.infer<typeof PlanSummaryEntrySchema>

export const PlanSummarySchema = z.object({
	headline: z.string(),
	areas: z.array(
		z.object({
			name: z.string(),
			why: z.string(),
			entries: z.array(PlanSummaryEntrySchema)
		})
	)
})

export type PlanSummary = z.infer<typeof PlanSummarySchema>

export const PlanSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	createdByUserId: z.string().nullable(),
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
	state: PlanStateSchema.nullish().default(null),
	summary: PlanSummarySchema.nullish().default(null),
	summarisedAt: z.iso.datetime().nullish().default(null),
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
	verified: z.boolean(),
	// Why this criterion could not be driven. Optional for the same reason every
	// other new field here is: this app and the backend ship separately.
	blockedReason: z.string().nullish().default(null)
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

// Declared here rather than borrowed from the queue slice, which this one may
// not import. Only what the plan's execution tab renders: the queue screen shows
// a run differently and asks for different fields.
export const PlanRunSchema = z.object({
	id: z.string(),
	ordinal: z.number().int(),
	status: z.enum(['pending', 'running', 'done', 'failed']),
	sliceTitle: z.string(),
	sliceKind: z.enum(['build', 'verify']),
	activity: z.string().nullish().default(null),
	commitSha: z.string().nullable(),
	report: z.string().nullish().default(null),
	failureReason: z.string().nullable(),
	startedAt: z.iso.datetime().nullable(),
	finishedAt: z.iso.datetime().nullable()
})

export type PlanRun = z.infer<typeof PlanRunSchema>

// Null until the plan has been handed to a queue.
export const PlanExecutionSchema = z.object({
	queueId: z.string(),
	queueName: z.string(),
	item: z.object({
		status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']),
		branch: z.string().nullable(),
		prUrl: z.string().nullable(),
		failureReason: z.string().nullable()
	}),
	runs: z.array(PlanRunSchema)
})

export type PlanExecution = z.infer<typeof PlanExecutionSchema>

export const PlanDetailSchema = z.object({
	plan: PlanSchema,
	execution: PlanExecutionSchema.nullish().default(null),
	messages: z.array(PlanMessageSchema),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema),
	blockedBy: z.array(PlanSchema),
	decisions: z.array(PlanDecisionSchema)
})

export type PlanDetail = z.infer<typeof PlanDetailSchema>
