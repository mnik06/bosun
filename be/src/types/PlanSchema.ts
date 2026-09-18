import { z } from 'zod';
import { FootprintSchema } from 'src/types/FootprintSchema';
import { PlanSummarySchema } from 'src/types/PlanSummarySchema';

export const PlanStatusSchema = z.enum(['planning', 'ready', 'failed']);

export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	createdByUserId: z.string().nullable(),
	machineId: z.string(),
	// The line a plan joins. Null only on a plan written on a machine with no
	// repository, which can be planned and never approved.
	repositoryId: z.string().nullable(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	number: z.number().int(),
	status: PlanStatusSchema,
	verifyInUi: z.boolean(),
	auto: z.boolean(),
	afk: z.boolean(),
	approvedAt: z.date().nullable(),
	failureReason: z.string().nullable(),
	input: z.string(),
	summary: PlanSummarySchema.nullable(),
	summarisedAt: z.date().nullable(),
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

export type PlanMessageRole = PlanMessage['role'];

export const AcSchema = z.object({
	id: z.string(),
	planId: z.string(),
	code: z.string(),
	text: z.string(),
	sliceId: z.string().nullable(),
	ordinal: z.number().int(),
	implemented: z.boolean(),
	verified: z.boolean(),
	blockedReason: z.string().nullable()
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
	bodyMd: z.string().nullable(),
	// The first bullet, holding every piece another plan could consume. It is what a
	// dependent stacks on, so a dependent waits one bullet rather than a feature.
	foundation: z.boolean(),
	footprint: FootprintSchema,
	// What the landed commit actually touched. The declared footprint stays the
	// source for schema and contracts, which a file list cannot express.
	changedFiles: z.array(z.string()).nullable()
});

export type Slice = z.infer<typeof SliceSchema>;

export const PlanDecisionSchema = z.object({
	id: z.string(),
	planId: z.string(),
	fork: z.string(),
	options: z.string().nullable(),
	chose: z.string(),
	blastRadius: z.string().nullable(),
	reversing: z.string().nullable(),
	createdAt: z.coerce.date()
});

export type PlanDecision = z.infer<typeof PlanDecisionSchema>;
