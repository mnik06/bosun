import { z } from 'zod';
import { PlanQuestionSchema } from '../../protocol';

export const AskArgsSchema = z.object({ questions: z.array(PlanQuestionSchema).min(1) });

export const CreatePlanArgsSchema = z.object({
	title: z.string().min(1),
	bodyMd: z.string().min(1)
});

export const AddAcArgsSchema = z.object({ code: z.string().min(1), text: z.string().min(1) });

export const CreateSliceArgsSchema = z.object({
	ordinal: z.number().int().min(1),
	kind: z.enum(['build', 'verify']),
	title: z.string().min(1),
	bodyMd: z.string().optional(),
	acCodes: z.array(z.string().min(1))
});

const DESCRIPTIONS: Record<string, string> = {
	bosun_ask:
		'Ask the user one or more multiple-choice questions and block until they answer in the browser. This is the only way to ask the user anything — there is no terminal and no other channel. Every question needs a short header, the question itself, and 2-4 options with a one-line description each. The user may also type a free-text answer instead of picking an option.',
	create_plan:
		'Publish the plan title and its markdown body. Call this once, before add_ac, and only after every question is resolved.',
	add_ac:
		'Add one acceptance criterion. Codes are AC-1, AC-2, ... in order. Every AC must later be claimed by exactly one tracer bullet.',
	create_slice:
		'Create one tracer bullet and claim the acceptance criteria it delivers. acCodes must name ACs that exist and that no other bullet has claimed.'
};

export const TOOL_SCHEMAS = {
	bosun_ask: AskArgsSchema,
	create_plan: CreatePlanArgsSchema,
	add_ac: AddAcArgsSchema,
	create_slice: CreateSliceArgsSchema
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

// Derived from the Zod schemas rather than written out beside them. Hand-keeping
// two declarations of the same shape in sync is a drift the model only discovers
// by calling a tool with arguments the parser then rejects.
export const TOOL_DEFINITIONS = Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
	name,
	description: DESCRIPTIONS[name]!,
	inputSchema: z.toJSONSchema(schema, { target: 'draft-7' })
}));
