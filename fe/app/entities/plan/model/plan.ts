import { z } from 'zod'

import {
	BuildSchema,
	BuildSummarySchema,
	DependencyViewSchema,
	IntegrationSchema,
	OverlapDecisionViewSchema,
	PendingRunQuestionSchema,
	PlanAmendmentSchema,
	PlanRefSchema,
	SliceRunSchema,
	VerifyFindingSchema
} from '~/entities/plan/model/build'
import { FootprintSchema } from '~/entities/plan/model/footprint'
import { PlanAnswerSchema, PlanQuestionSchema } from '~/entities/plan/model/question'

export const PlanStatusSchema = z.enum(['planning', 'ready', 'failed'])

export type PlanStatus = z.infer<typeof PlanStatusSchema>

// What the plan is doing, derived by the backend from the plan row and its
// latest build. Optional on the row because a plan pushed over the socket is the
// row alone; the badge falls back to what the row can support.
export const PlanStateSchema = z.enum([
	'drafting',
	'needs_approval',
	'scheduled',
	'held',
	'building',
	'integrating',
	'verifying',
	'in_review',
	'fixing_bugs',
	'merged',
	'needs_you',
	'failed',
	'cancelled'
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
	repositoryId: z.string().nullable(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	number: z.number().int(),
	status: PlanStatusSchema,
	verifyInUi: z.boolean(),
	auto: z.boolean(),
	afk: z.boolean(),
	approvedAt: z.iso.datetime().nullable(),
	failureReason: z.string().nullable(),
	input: z.string(),
	state: PlanStateSchema.nullish().default(null),
	summary: PlanSummarySchema.nullish().default(null),
	summarisedAt: z.iso.datetime().nullish().default(null),
	createdAt: z.iso.datetime()
})

export type Plan = z.infer<typeof PlanSchema>

// Only the list carries these: a plan pushed over the socket is the row alone, so
// a shape that expected them on every plan would blank them on every push.
export const PlanListEntrySchema = PlanSchema.extend({
	build: BuildSummarySchema.nullable(),
	reason: z.string().nullable(),
	ownerEmail: z.string().nullable()
})

export type PlanListEntry = z.infer<typeof PlanListEntrySchema>

export const PlanListSchema = z.array(PlanListEntrySchema)

export { PlanAnswerSchema, PlanQuestionSchema, type PlanAnswer, type PlanQuestion } from '~/entities/plan/model/question'

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
	bodyMd: z.string().nullable(),
	foundation: z.boolean(),
	footprint: FootprintSchema,
	changedFiles: z.array(z.string()).nullable()
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
	decisions: z.array(PlanDecisionSchema),
	build: BuildSchema.nullable(),
	runs: z.array(SliceRunSchema),
	dependencies: z.array(DependencyViewSchema),
	dependents: z.array(PlanRefSchema),
	amendments: z.array(PlanAmendmentSchema),
	overlapDecisions: z.array(OverlapDecisionViewSchema),
	integrations: z.array(IntegrationSchema),
	findings: z.array(VerifyFindingSchema),
	pendingQuestion: PendingRunQuestionSchema.nullable(),
	reason: z.string().nullable()
})

export type PlanDetail = z.infer<typeof PlanDetailSchema>
