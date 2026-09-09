import { z } from 'zod';
import { PlanAnswerSchema } from 'src/types/PlanSchema';

export const CreateQueueReqSchema = z.object({
	machineId: z.string().min(1),
	name: z.string().min(1).max(60),
	afk: z.boolean().default(false)
});

export const QueueIdParamsSchema = z.object({ id: z.string().min(1) });

export const ListQueuesQuerySchema = z.object({ machineId: z.string().min(1).optional() });

export const EnqueuePlanReqSchema = z.object({ planId: z.string().min(1) });

export const ControlQueueReqSchema = z.object({
	action: z.enum(['pause', 'resume'])
});

export const RunIdParamsSchema = z.object({ runId: z.string().min(1) });

export const AnswerRunReqSchema = z.object({
	questionId: z.string().min(1),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const UpdateQueueReqSchema = z.object({ afk: z.boolean() });

export const QueueItemParamsSchema = z.object({
	id: z.string().min(1),
	itemId: z.string().min(1)
});

export const AskQueueReqSchema = z.object({ question: z.string().min(1).max(4000) });
