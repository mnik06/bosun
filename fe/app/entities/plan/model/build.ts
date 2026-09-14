import { z } from 'zod'

import { PlanAnswerSchema, PlanQuestionSchema } from '~/entities/plan/model/question'

// Declared beside the plan rather than in an entity of its own: the plan page reads
// a plan and its build as one document, and a sibling entity is not importable.

export const BuildStatusSchema = z.enum([
	'scheduled',
	'held',
	'building',
	'waiting_answer',
	'integrating',
	'waiting_verify',
	'driving',
	'fixing',
	'rechecking',
	'in_review',
	'merged',
	'needs_you',
	'failed',
	'cancelled'
])

export type BuildStatus = z.infer<typeof BuildStatusSchema>

export const NeedsYouReasonSchema = z.enum([
	'overlap',
	'integration',
	'checks',
	'provider_failed',
	'recheck_failed',
	'worktree'
])

export type NeedsYouReason = z.infer<typeof NeedsYouReasonSchema>

export const BuildSchema = z.object({
	id: z.string(),
	planId: z.string(),
	repositoryId: z.string(),
	machineId: z.string().nullable(),
	position: z.number().int(),
	status: BuildStatusSchema,
	needsYouReason: NeedsYouReasonSchema.nullable(),
	branch: z.string().nullable(),
	baseBranch: z.string().nullable(),
	worktreePath: z.string().nullable(),
	portBase: z.number().int().nullable(),
	prNumber: z.number().int().nullable(),
	prUrl: z.string().nullable(),
	failureReason: z.string().nullable(),
	createdAt: z.iso.datetime(),
	startedAt: z.iso.datetime().nullable(),
	builtAt: z.iso.datetime().nullable(),
	verifiedAt: z.iso.datetime().nullable(),
	finishedAt: z.iso.datetime().nullable(),
	mergedAt: z.iso.datetime().nullable()
})

export type Build = z.infer<typeof BuildSchema>

export const BuildSummarySchema = z.object({
	id: z.string(),
	status: BuildStatusSchema,
	needsYouReason: NeedsYouReasonSchema.nullable(),
	position: z.number().int(),
	machineId: z.string().nullable(),
	prNumber: z.number().int().nullable(),
	prUrl: z.string().nullable(),
	bulletsDone: z.number().int(),
	bulletsTotal: z.number().int(),
	createdAt: z.iso.datetime(),
	finishedAt: z.iso.datetime().nullable()
})

export type BuildSummary = z.infer<typeof BuildSummarySchema>

export const RunPhaseSchema = z.enum(['drive', 'fix', 'recheck'])

export type RunPhase = z.infer<typeof RunPhaseSchema>

export const SliceRunStatusSchema = z.enum(['pending', 'running', 'done', 'failed'])

export type SliceRunStatus = z.infer<typeof SliceRunStatusSchema>

export const SliceRunSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	sliceId: z.string(),
	ordinal: z.number().int(),
	phase: RunPhaseSchema.nullable(),
	status: SliceRunStatusSchema,
	questionId: z.string().nullable(),
	question: z.array(PlanQuestionSchema).nullable(),
	questionAskedAt: z.iso.datetime().nullable(),
	answer: z
		.object({
			questionId: z.string(),
			questions: z.array(PlanQuestionSchema),
			answers: z.array(PlanAnswerSchema)
		})
		.nullable(),
	acCodes: z.array(z.string()).nullable(),
	commitSha: z.string().nullable(),
	report: z.string().nullable(),
	failureReason: z.string().nullable(),
	createdAt: z.iso.datetime(),
	startedAt: z.iso.datetime().nullable(),
	finishedAt: z.iso.datetime().nullable(),
	sliceTitle: z.string(),
	sliceKind: z.enum(['build', 'verify']),
	activity: z.string().nullable()
})

export type SliceRun = z.infer<typeof SliceRunSchema>

export const IntegrationSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	trigger: z.enum(['built', 'base_moved', 'provider_moved', 'retarget']),
	onto: z.string(),
	ontoSha: z.string().nullable(),
	status: z.enum(['pending', 'running', 'done', 'needs_you']),
	merged: z.boolean(),
	regenerated: z.array(z.object({ name: z.string(), files: z.array(z.string()) })),
	resolved: z.array(z.object({ file: z.string(), diff: z.string() })),
	checks: z.enum(['passed', 'failed', 'skipped']).nullable(),
	detail: z.string().nullable(),
	createdAt: z.iso.datetime(),
	startedAt: z.iso.datetime().nullable(),
	finishedAt: z.iso.datetime().nullable()
})

export type Integration = z.infer<typeof IntegrationSchema>

export const VerifyFindingSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	runId: z.string(),
	acCode: z.string().nullable(),
	kind: z.enum(['criterion', 'console', 'network', 'visual']),
	reproduction: z.string(),
	severity: z.enum(['high', 'medium', 'low']),
	status: z.enum(['open', 'fixed', 'left', 'accepted']),
	note: z.string().nullable(),
	acceptedByUserId: z.string().nullable(),
	createdAt: z.iso.datetime()
})

export type VerifyFinding = z.infer<typeof VerifyFindingSchema>

export const DependencyViewSchema = z.object({
	id: z.string(),
	planId: z.string(),
	providerPlanId: z.string(),
	providerSliceId: z.string().nullable(),
	source: z.enum(['planned', 'detected', 'manual']),
	reason: z.string(),
	overriddenByUserId: z.string().nullable(),
	overriddenAt: z.iso.datetime().nullable(),
	createdAt: z.iso.datetime(),
	providerNumber: z.number().int(),
	providerTitle: z.string().nullable(),
	providerSliceOrdinal: z.number().int().nullable(),
	providerSliceTitle: z.string().nullable(),
	released: z.boolean()
})

export type DependencyView = z.infer<typeof DependencyViewSchema>

export const PlanAmendmentSchema = z.object({
	id: z.string(),
	planId: z.string(),
	sourcePlanId: z.string().nullable(),
	text: z.string(),
	createdAt: z.iso.datetime()
})

export type PlanAmendment = z.infer<typeof PlanAmendmentSchema>

export const OverlapChoiceSchema = z.enum(['use_theirs', 'change_theirs', 'rename'])

export type OverlapChoice = z.infer<typeof OverlapChoiceSchema>

export const OverlapDecisionViewSchema = z.object({
	id: z.string(),
	planId: z.string(),
	providerPlanId: z.string(),
	item: z.object({
		key: z.string(),
		kind: z.enum(['schema', 'contract', 'module']),
		label: z.string(),
		ours: z.string(),
		theirs: z.string(),
		providerSliceId: z.string().nullable()
	}),
	options: z.array(OverlapChoiceSchema),
	chosen: OverlapChoiceSchema.nullable(),
	decidedByUserId: z.string().nullable(),
	decidedAt: z.iso.datetime().nullable(),
	createdAt: z.iso.datetime(),
	providerNumber: z.number().int(),
	providerTitle: z.string().nullable()
})

export type OverlapDecisionView = z.infer<typeof OverlapDecisionViewSchema>

export const PlanRefSchema = z.object({
	planId: z.string(),
	number: z.number().int(),
	title: z.string().nullable()
})

export type PlanRef = z.infer<typeof PlanRefSchema>

export const PendingRunQuestionSchema = z.object({
	runId: z.string(),
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema),
	askedAt: z.iso.datetime().nullable(),
	released: z.boolean()
})

export type PendingRunQuestion = z.infer<typeof PendingRunQuestionSchema>
