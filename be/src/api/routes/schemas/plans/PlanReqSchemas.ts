import { z } from 'zod';
import { PlanAnswerSchema, SliceKindSchema } from 'src/types/PlanSchema';

export const PlanIdParamsSchema = z.object({ id: z.string() });

export const CreatePlanReqSchema = z.object({
	machineId: z.string().min(1),
	input: z.string().min(1),
	verifyInUi: z.boolean().default(true)
});

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
				acCodes: z.array(z.string().min(1)).default([])
			})
		)
		.min(1)
});

export const AgentAcMarkParamsSchema = z.object({ id: z.string(), code: z.string() });

export const AgentAcMarkReqSchema = z
	.object({ implemented: z.boolean(), verified: z.boolean() })
	.partial();

export const AgentBlockersReqSchema = z.object({
	blockedByNumbers: z.array(z.number().int().positive())
});

export const AgentDecisionReqSchema = z.object({
	sliceId: z.string().nullable().default(null),
	fork: z.string().min(1),
	options: z.string().nullable().default(null),
	chose: z.string().min(1),
	blastRadius: z.string().nullable().default(null),
	reversing: z.string().nullable().default(null)
});
