import { z } from 'zod';
import { PlanAnswerSchema, PlanQuestionSchema } from 'src/types/PlanSchema';

// A build is one attempt at building a plan: its branch, its worktree, its place
// in its repository's line. It replaces the queue item and the queue with it.
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
	'fixing_bugs',
	'merged',
	'needs_you',
	'failed',
	'cancelled'
]);

export type BuildStatus = z.infer<typeof BuildStatusSchema>;

// Every status that is still going somewhere. A plan has at most one of these.
export const ACTIVE_BUILD_STATUSES: BuildStatus[] = [
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
	'fixing_bugs',
	'needs_you'
];

// Past building, not yet merged: what an integration keeps mergeable.
export const UNMERGED_BUILT_STATUSES: BuildStatus[] = [
	'integrating',
	'waiting_verify',
	'driving',
	'fixing',
	'rechecking',
	'in_review'
];

export const NeedsYouReasonSchema = z.enum([
	'overlap',
	'integration',
	'checks',
	'provider_failed',
	'recheck_failed',
	'worktree'
]);

export type NeedsYouReason = z.infer<typeof NeedsYouReasonSchema>;

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
	createdAt: z.coerce.date(),
	startedAt: z.coerce.date().nullable(),
	builtAt: z.coerce.date().nullable(),
	verifiedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable(),
	mergedAt: z.coerce.date().nullable()
});

export type Build = z.infer<typeof BuildSchema>;

export const SliceRunStatusSchema = z.enum(['pending', 'running', 'done', 'failed']);

export type SliceRunStatus = z.infer<typeof SliceRunStatusSchema>;

// Null on a build bullet. A verify slice is run as several sessions: a drive in the
// lane, a fix in a build slot, and a re-check of what the fix repaired.
export const RunPhaseSchema = z.enum(['drive', 'fix', 'recheck']);

export type RunPhase = z.infer<typeof RunPhaseSchema>;

// The question a restarted bullet was asked, with the answer it is restarted with.
export const RunAnswerSchema = z.object({
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema),
	answers: z.array(PlanAnswerSchema)
});

export type RunAnswer = z.infer<typeof RunAnswerSchema>;

export const SliceRunSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	sliceId: z.string(),
	ordinal: z.number().int(),
	phase: RunPhaseSchema.nullable(),
	status: SliceRunStatusSchema,
	questionId: z.string().nullable(),
	question: z.array(PlanQuestionSchema).nullable(),
	questionAskedAt: z.coerce.date().nullable(),
	answer: RunAnswerSchema.nullable(),
	// The criteria a re-check drives, or a fix-again session is given.
	acCodes: z.array(z.string()).nullable(),
	commitSha: z.string().nullable(),
	report: z.string().nullable(),
	failureReason: z.string().nullable(),
	createdAt: z.coerce.date(),
	startedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable()
});

export type SliceRun = z.infer<typeof SliceRunSchema>;

export const SliceRunDetailSchema = SliceRunSchema.extend({
	sliceTitle: z.string(),
	sliceKind: z.enum(['build', 'verify']),
	activity: z.string().nullable()
});

export const IntegrationTriggerSchema = z.enum(['built', 'base_moved', 'provider_moved', 'retarget']);

export type IntegrationTrigger = z.infer<typeof IntegrationTriggerSchema>;

export const IntegrationStatusSchema = z.enum(['pending', 'running', 'done', 'needs_you']);

export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const RegeneratedSchema = z.object({ name: z.string(), files: z.array(z.string()) });

export type Regenerated = z.infer<typeof RegeneratedSchema>;

export const ResolvedConflictSchema = z.object({ file: z.string(), diff: z.string() });

export type ResolvedConflict = z.infer<typeof ResolvedConflictSchema>;

export const IntegrationSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	trigger: IntegrationTriggerSchema,
	onto: z.string(),
	ontoSha: z.string().nullable(),
	status: IntegrationStatusSchema,
	merged: z.boolean(),
	regenerated: z.array(RegeneratedSchema),
	resolved: z.array(ResolvedConflictSchema),
	checks: z.enum(['passed', 'failed', 'skipped']).nullable(),
	detail: z.string().nullable(),
	createdAt: z.coerce.date(),
	startedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable()
});

export type Integration = z.infer<typeof IntegrationSchema>;

export const FindingKindSchema = z.enum(['criterion', 'console', 'network', 'visual']);

export const FindingStatusSchema = z.enum(['open', 'fixed', 'left', 'accepted']);

export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const FindingSeveritySchema = z.enum(['high', 'medium', 'low']);

export const VerifyFindingSchema = z.object({
	id: z.string(),
	buildId: z.string(),
	runId: z.string(),
	acCode: z.string().nullable(),
	kind: FindingKindSchema,
	reproduction: z.string(),
	severity: FindingSeveritySchema,
	status: FindingStatusSchema,
	note: z.string().nullable(),
	acceptedByUserId: z.string().nullable(),
	createdAt: z.coerce.date()
});

export type VerifyFinding = z.infer<typeof VerifyFindingSchema>;

export const DependencySourceSchema = z.enum(['planned', 'detected', 'manual']);

export type DependencySource = z.infer<typeof DependencySourceSchema>;

export const PlanDependencySchema = z.object({
	id: z.string(),
	planId: z.string(),
	providerPlanId: z.string(),
	// Null is the provider's whole feature.
	providerSliceId: z.string().nullable(),
	source: DependencySourceSchema,
	reason: z.string(),
	overriddenByUserId: z.string().nullable(),
	overriddenAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date()
});

export type PlanDependency = z.infer<typeof PlanDependencySchema>;

export const PlanAmendmentSchema = z.object({
	id: z.string(),
	planId: z.string(),
	sourcePlanId: z.string().nullable(),
	text: z.string(),
	createdAt: z.coerce.date()
});

export type PlanAmendment = z.infer<typeof PlanAmendmentSchema>;

export const OverlapChoiceSchema = z.enum(['use_theirs', 'change_theirs', 'rename']);

export type OverlapChoice = z.infer<typeof OverlapChoiceSchema>;

export const OverlapItemSchema = z.object({
	key: z.string(),
	kind: z.enum(['schema', 'contract', 'module']),
	label: z.string(),
	ours: z.string(),
	theirs: z.string(),
	providerSliceId: z.string().nullable()
});

export type OverlapItem = z.infer<typeof OverlapItemSchema>;

export const OverlapDecisionSchema = z.object({
	id: z.string(),
	planId: z.string(),
	providerPlanId: z.string(),
	item: OverlapItemSchema,
	options: z.array(OverlapChoiceSchema),
	chosen: OverlapChoiceSchema.nullable(),
	createdAt: z.coerce.date()
});

export type OverlapDecision = z.infer<typeof OverlapDecisionSchema>;

export const RepositoryMessageRoleSchema = z.enum(['user', 'assistant']);

export type RepositoryMessageRole = z.infer<typeof RepositoryMessageRoleSchema>;

export const RepositoryMessageSchema = z.object({
	id: z.string(),
	repositoryId: z.string(),
	role: RepositoryMessageRoleSchema,
	content: z.string(),
	createdAt: z.coerce.date()
});

export type RepositoryMessage = z.infer<typeof RepositoryMessageSchema>;

// A title becomes part of a branch name, so it is reduced to what git accepts.
export function toBranchSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}
