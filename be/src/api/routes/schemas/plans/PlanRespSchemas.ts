import { z } from 'zod';
import {
	AcSchema,
	PlanDecisionSchema,
	PlanMessageSchema,
	PlanSchema,
	SliceSchema
} from 'src/types/PlanSchema';

export const PlanListRespSchema = z.array(PlanSchema);

export const PlanDetailRespSchema = z.object({
	plan: PlanSchema,
	messages: z.array(PlanMessageSchema),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema),
	blockedBy: z.array(PlanSchema),
	decisions: z.array(PlanDecisionSchema)
});

export const AnswerPlanRespSchema = z.object({ status: z.literal('accepted') });

export const AgentPlanRespSchema = z.object({ planId: z.string() });

export const AgentAcRespSchema = z.object({ code: z.string(), implemented: z.boolean(), verified: z.boolean() });

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

export const AgentDecisionRespSchema = z.object({ decisionId: z.string() });
