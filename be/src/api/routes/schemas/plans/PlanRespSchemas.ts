import { z } from 'zod';
import {
	BuildSchema,
	BuildStatusSchema,
	IntegrationSchema,
	NeedsYouReasonSchema,
	OverlapDecisionSchema,
	PlanAmendmentSchema,
	PlanDependencySchema,
	SliceRunDetailSchema,
	VerifyFindingSchema
} from 'src/types/BuildSchema';
import { PlanCriteriaSchema } from 'src/types/build-frames';
import { PlanBugSchema } from 'src/types/BugfixSchema';
import { FootprintSchema } from 'src/types/FootprintSchema';
import {
	AcSchema,
	PlanDecisionSchema,
	PlanMessageSchema,
	PlanQuestionSchema,
	PlanSchema,
	SliceSchema
} from 'src/types/PlanSchema';
import { PlanStateSchema } from 'src/types/PlanStateSchema';

export const PlanWithStateSchema = PlanSchema.extend({ state: PlanStateSchema });

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
	createdAt: z.coerce.date(),
	finishedAt: z.coerce.date().nullable()
});

export type BuildSummary = z.infer<typeof BuildSummarySchema>;

export const PlanListEntrySchema = PlanWithStateSchema.extend({
	build: BuildSummarySchema.nullable(),
	reason: z.string().nullable(),
	ownerEmail: z.string().nullable()
});

export const PlanListRespSchema = z.array(PlanListEntrySchema);

export const DependencyViewSchema = PlanDependencySchema.extend({
	providerNumber: z.number().int(),
	providerTitle: z.string().nullable(),
	providerSliceOrdinal: z.number().int().nullable(),
	providerSliceTitle: z.string().nullable(),
	released: z.boolean()
});

export type DependencyView = z.infer<typeof DependencyViewSchema>;

export const OverlapDecisionViewSchema = OverlapDecisionSchema.extend({
	providerNumber: z.number().int(),
	providerTitle: z.string().nullable()
});

export type OverlapDecisionView = z.infer<typeof OverlapDecisionViewSchema>;

export const PlanRefSchema = z.object({
	planId: z.string(),
	number: z.number().int(),
	title: z.string().nullable()
});

export const PendingRunQuestionSchema = z.object({
	runId: z.string(),
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema),
	askedAt: z.coerce.date().nullable(),
	// The session was released while the question waited; answering restarts the
	// bullet with the answer in its prompt.
	released: z.boolean()
});

export const PlanDetailRespSchema = z.object({
	plan: PlanWithStateSchema,
	messages: z.array(PlanMessageSchema),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema),
	decisions: z.array(PlanDecisionSchema),
	build: BuildSchema.nullable(),
	runs: z.array(SliceRunDetailSchema),
	dependencies: z.array(DependencyViewSchema),
	dependents: z.array(PlanRefSchema),
	amendments: z.array(PlanAmendmentSchema),
	overlapDecisions: z.array(OverlapDecisionViewSchema),
	integrations: z.array(IntegrationSchema),
	findings: z.array(VerifyFindingSchema),
	pendingQuestion: PendingRunQuestionSchema.nullable(),
	reason: z.string().nullable()
});

export const ApprovePlanRespSchema = z.object({
	build: BuildSchema,
	overlapDecisions: z.array(OverlapDecisionViewSchema)
});

export const AnswerPlanRespSchema = z.object({ status: z.literal('accepted') });

export const AgentPlanRespSchema = z.object({ planId: z.string() });

export const AgentAcRespSchema = z.object({
	code: z.string(),
	implemented: z.boolean(),
	verified: z.boolean(),
	blockedReason: z.string().nullable()
});

// What a session sees of the other plans in its repository. Footprints only for
// approved, unmerged plans — the pieces a plan written now could consume.
export const AgentMachinePlansRespSchema = z.array(
	z.object({
		number: z.number().int(),
		title: z.string().nullable(),
		status: z.string(),
		state: PlanStateSchema,
		summary: z.string().nullable(),
		slices: z.array(
			z.object({
				ordinal: z.number().int(),
				kind: z.string(),
				title: z.string(),
				foundation: z.boolean(),
				footprint: FootprintSchema.nullable()
			})
		),
		dependsOn: z.array(z.number().int())
	})
);

export const AgentPlanCriteriaRespSchema = z.array(PlanCriteriaSchema);

export const AgentBlockersRespSchema = z.object({ blockedBy: z.array(z.number().int()) });

export const AgentDecisionRespSchema = z.object({ decisionId: z.string() });

export const AgentFindingRespSchema = z.object({ findingId: z.string() });

export const AgentPlanBugsRespSchema = z.array(PlanBugSchema);

export const AgentPlanBugRespSchema = PlanBugSchema;
