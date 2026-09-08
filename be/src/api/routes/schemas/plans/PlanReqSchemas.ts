import { z } from 'zod';
import { PlanAnswerSchema, SliceKindSchema } from 'src/types/PlanSchema';

export const PlanIdParamsSchema = z.object({ id: z.string() });

export const AcParamsSchema = z.object({ id: z.string(), acId: z.string() });

export const SliceParamsSchema = z.object({ id: z.string(), sliceId: z.string() });

export const CreatePlanReqSchema = z.object({
	machineId: z.string().min(1),
	input: z.string().min(1)
});

export const AnswerPlanReqSchema = z.object({
	questionId: z.string().min(1),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const UpdatePlanReqSchema = z
	.object({ title: z.string().min(1), bodyMd: z.string() })
	.partial();

export const UpdateAcReqSchema = z
	.object({ text: z.string().min(1), sliceId: z.string().nullable() })
	.partial();

export const CreateSliceReqSchema = z.object({
	title: z.string().min(1),
	kind: SliceKindSchema.default('build')
});

export const UpdateSliceReqSchema = z
	.object({ title: z.string().min(1), bodyMd: z.string(), ordinal: z.number().int().min(1) })
	.partial();

export const AgentPlanTitleReqSchema = z.object({
	title: z.string().min(1),
	bodyMd: z.string().min(1)
});

export const AgentAcReqSchema = z.object({
	code: z.string().min(1),
	text: z.string().min(1)
});

export const AgentSliceReqSchema = z.object({
	ordinal: z.number().int().min(1),
	kind: SliceKindSchema,
	title: z.string().min(1),
	bodyMd: z.string().optional(),
	acCodes: z.array(z.string().min(1))
});

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
