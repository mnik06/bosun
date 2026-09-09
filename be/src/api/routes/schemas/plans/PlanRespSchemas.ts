import { z } from 'zod';
import {
	AcSchema,
	PlanDecisionSchema,
	PlanMessageSchema,
	PlanSchema,
	SliceSchema
} from 'src/types/PlanSchema';
import { PlanStateSchema } from 'src/types/PlanStateSchema';
import { QueueItemSchema, SliceRunDetailSchema } from 'src/types/QueueSchema';

export const PlanWithStateSchema = PlanSchema.extend({ state: PlanStateSchema });

// Null until the plan has been handed to a queue. `runs` is the same shape the
// queue screen renders, so a bullet reads the same wherever you meet it.
export const PlanExecutionSchema = z.object({
	queueId: z.string(),
	queueName: z.string(),
	item: QueueItemSchema,
	runs: z.array(SliceRunDetailSchema)
});

export const PlanListRespSchema = z.array(PlanWithStateSchema);

export const PlanDetailRespSchema = z.object({
	plan: PlanWithStateSchema,
	execution: PlanExecutionSchema.nullable(),
	messages: z.array(PlanMessageSchema),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema),
	blockedBy: z.array(PlanSchema),
	decisions: z.array(PlanDecisionSchema)
});

export const AnswerPlanRespSchema = z.object({ status: z.literal('accepted') });

export const AgentPlanRespSchema = z.object({ planId: z.string() });

export const AgentAcRespSchema = z.object({
	code: z.string(),
	implemented: z.boolean(),
	verified: z.boolean(),
	blockedReason: z.string().nullable()
});

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
