import { z } from 'zod';

export const PlanStatusSchema = z.enum(['planning', 'ready', 'failed']);

export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanSchema = z.object({
	id: z.string(),
	userId: z.string(),
	machineId: z.string(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	status: PlanStatusSchema,
	failureReason: z.string().nullable(),
	input: z.string(),
	createdAt: z.date()
});

export type Plan = z.infer<typeof PlanSchema>;

export const PlanQuestionSchema = z.object({
	header: z.string(),
	question: z.string(),
	options: z.array(z.object({ label: z.string(), description: z.string() })),
	multiSelect: z.boolean()
});

export type PlanQuestion = z.infer<typeof PlanQuestionSchema>;

// One entry per question in the same order, so an answer needs no key back to
// the question it belongs to and cannot be paired with the wrong one.
export const PlanAnswerSchema = z.object({ selected: z.array(z.string()).min(1) });

export type PlanAnswer = z.infer<typeof PlanAnswerSchema>;

export const PlanMessageRoleSchema = z.enum(['user', 'assistant', 'activity', 'question', 'answer']);

export type PlanMessageRole = z.infer<typeof PlanMessageRoleSchema>;

const messageBase = {
	id: z.string(),
	planId: z.string(),
	seq: z.number().int(),
	createdAt: z.date()
};

const TextContentSchema = z.object({ text: z.string() });

export const PlanMessageSchema = z.discriminatedUnion('role', [
	z.object({ ...messageBase, role: z.literal('user'), content: TextContentSchema }),
	z.object({ ...messageBase, role: z.literal('assistant'), content: TextContentSchema }),
	z.object({
		...messageBase,
		role: z.literal('activity'),
		content: z.object({ label: z.string() })
	}),
	z.object({
		...messageBase,
		role: z.literal('question'),
		content: z.object({
			questionId: z.string(),
			questions: z.array(PlanQuestionSchema)
		})
	}),
	z.object({
		...messageBase,
		role: z.literal('answer'),
		content: z.object({
			questionId: z.string(),
			answers: z.array(PlanAnswerSchema)
		})
	})
]);

export type PlanMessage = z.infer<typeof PlanMessageSchema>;

export type PlanMessageContent = PlanMessage['content'];

export const AcSchema = z.object({
	id: z.string(),
	planId: z.string(),
	code: z.string(),
	text: z.string(),
	sliceId: z.string().nullable(),
	ordinal: z.number().int()
});

export type Ac = z.infer<typeof AcSchema>;

export const SliceKindSchema = z.enum(['build', 'verify']);

export type SliceKind = z.infer<typeof SliceKindSchema>;

export const SliceSchema = z.object({
	id: z.string(),
	planId: z.string(),
	ordinal: z.number().int(),
	kind: SliceKindSchema,
	title: z.string(),
	bodyMd: z.string().nullable()
});

export type Slice = z.infer<typeof SliceSchema>;
