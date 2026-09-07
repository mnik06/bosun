import { z } from 'zod';
import { PlanQuestionSchema } from 'src/types/PlanSchema';

// Imported by both unions: a planning session's frames travel from the agent and
// are forwarded to the browser unchanged. Declared here rather than in either
// file because a module that owns one union and re-exports the other is a cycle,
// and a cycle here leaves `z.discriminatedUnion` reading an undefined member at
// import time — which fails as the whole process rather than as one route.
export const PlanTextMsgSchema = z.object({
	type: z.literal('plan.text'),
	planId: z.string(),
	delta: z.string()
});

export const PlanActivityMsgSchema = z.object({
	type: z.literal('plan.activity'),
	planId: z.string(),
	label: z.string()
});

export const PlanQuestionMsgSchema = z.object({
	type: z.literal('plan.question'),
	planId: z.string(),
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema).min(1)
});

export const PlanDoneMsgSchema = z.object({
	type: z.literal('plan.done'),
	planId: z.string()
});

export const PlanErrorMsgSchema = z.object({
	type: z.literal('plan.error'),
	planId: z.string(),
	message: z.string()
});

