import { z } from 'zod';
import {
	FindingKindSchema,
	FindingSeveritySchema
} from 'src/types/BuildSchema';
import { FootprintSchema } from 'src/types/FootprintSchema';
import { PlanAnswerSchema, SliceKindSchema } from 'src/types/PlanSchema';

export const PlanIdParamsSchema = z.object({ id: z.string() });

export const CreatePlanReqSchema = z.object({
	machineId: z.string().min(1),
	input: z.string().min(1),
	verifyInUi: z.boolean().default(true),
	auto: z.boolean().default(false),
	afk: z.boolean().default(false)
});

export const UpdatePlanReqSchema = z.object({ afk: z.boolean() });

export const SayToPlanReqSchema = z.object({ text: z.string().trim().min(1) });

export const AnswerPlanReqSchema = z.object({
	questionId: z.string().min(1),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const AgentPlanNameReqSchema = z.object({ title: z.string().min(1) });

export const AgentPublishReqSchema = z.object({
	title: z.string().min(1),
	bodyMd: z.string().min(1),
	acs: z.array(z.object({ code: z.string().min(1), text: z.string().min(1) })).min(1),
	slices: z
		.array(
			z.object({
				ordinal: z.number().int().min(1),
				kind: SliceKindSchema,
				title: z.string().min(1),
				bodyMd: z.string().nullable().default(null),
				acCodes: z.array(z.string().min(1)).default([]),
				foundation: z.boolean().default(false),
				// Required on a build bullet, refused on a verify bullet — `publishPlan`
				// says which, by ordinal, rather than a union the session cannot read.
				footprint: FootprintSchema.nullable().default(null)
			})
		)
		.min(1)
});

export const AgentAcMarkParamsSchema = z.object({ id: z.string(), code: z.string() });

export const AgentAcMarkReqSchema = z
	.object({
		implemented: z.boolean(),
		verified: z.boolean(),
		blockedReason: z.string().min(1)
	})
	.partial();

export const AgentBlockersReqSchema = z.object({
	blockedByNumbers: z.array(z.number().int().positive())
});

export const AgentDecisionReqSchema = z.object({
	fork: z.string().min(1),
	options: z.string().nullable().default(null),
	chose: z.string().min(1),
	blastRadius: z.string().nullable().default(null),
	reversing: z.string().nullable().default(null)
});

export const AgentPlanCriteriaQuerySchema = z.object({
	numbers: z
		.string()
		.regex(/^\d+(,\d+)*$/)
		.transform((value) => value.split(',').map(Number))
});

export const AgentBuildIdParamsSchema = z.object({ buildId: z.string().min(1) });

export const AgentFindingReqSchema = z.object({
	runId: z.string().min(1),
	acCode: z.string().min(1).nullable().default(null),
	kind: FindingKindSchema,
	reproduction: z.string().trim().min(1).max(4000),
	severity: FindingSeveritySchema.default('medium')
});

export const AgentFindingIdParamsSchema = z.object({ id: z.string().min(1) });

export const AgentResolveFindingReqSchema = z.object({
	status: z.enum(['fixed', 'left']),
	note: z.string().trim().min(1).max(2000)
});

export const AgentReportBugsReqSchema = z.object({
	sessionId: z.string().min(1),
	descriptions: z.array(z.string().trim().min(1).max(2000)).min(1)
});

export const AgentBugIdParamsSchema = z.object({ bugId: z.string().min(1) });

export const AgentUpdateBugStatusReqSchema = z
	.object({
		sessionId: z.string().min(1),
		status: z.enum(['fixing', 'fixed', 'failed']),
		note: z.string().trim().min(1).max(2000).optional()
	})
	.refine((value) => value.status !== 'failed' || value.note !== undefined, {
		message: 'note is required when marking a bug failed',
		path: ['note']
	});
