import { z } from 'zod';
import { AcSchema, PlanMessageSchema, PlanSchema, SliceSchema } from 'src/types/PlanSchema';

export const PlanListRespSchema = z.array(PlanSchema);

export const PlanDetailRespSchema = z.object({
	plan: PlanSchema,
	messages: z.array(PlanMessageSchema),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema)
});

export const AnswerPlanRespSchema = z.object({ status: z.literal('accepted') });

export const AgentAcRespSchema = z.object({ acId: z.string(), code: z.string() });

export const AgentSliceRespSchema = z.object({ sliceId: z.string() });

export const AgentPlanTitleRespSchema = z.object({ planId: z.string() });
