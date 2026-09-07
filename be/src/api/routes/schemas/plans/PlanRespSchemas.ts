import { z } from 'zod';
import { AcSchema, PlanMessageSchema, PlanSchema, SliceSchema } from 'src/types/PlanSchema';

export const PlanListRespSchema = z.array(PlanSchema);

export const PlanDetailRespSchema = z.object({
	plan: PlanSchema,
	messages: z.array(PlanMessageSchema),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema),
	blockedBy: z.array(PlanSchema)
});

export const AnswerPlanRespSchema = z.object({ status: z.literal('accepted') });

export const AgentAcRespSchema = z.object({ acId: z.string(), code: z.string() });

export const AgentSliceRespSchema = z.object({ sliceId: z.string() });

export const AgentPlanTitleRespSchema = z.object({ planId: z.string() });

export const AgentMachinePlansRespSchema = z.array(
	z.object({
		number: z.number().int(),
		title: z.string().nullable(),
		status: z.string(),
		summary: z.string().nullable(),
		slices: z.array(
			z.object({ ordinal: z.number().int(), kind: z.string(), title: z.string() })
		),
		blockedBy: z.array(z.number().int())
	})
);

export const AgentBlockersRespSchema = z.object({ blockedBy: z.array(z.number().int()) });
