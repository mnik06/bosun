import { z } from 'zod';
import { PlanQuestionSchema } from '../protocol';

export const AskArgsSchema = z.object({ questions: z.array(PlanQuestionSchema).min(1) });

export const ASK_DESCRIPTION =
	'Ask the user one or more multiple-choice questions and block until they answer in the browser. This is the only way to ask the user anything — there is no terminal and no other channel. Every question needs a short header, the question itself, and 2-4 options with a one-line description each. The user may also type a free-text answer instead of picking an option.';

export const ASK_DEFINITION = {
	name: 'bosun_ask',
	description: ASK_DESCRIPTION,
	inputSchema: z.toJSONSchema(AskArgsSchema, { target: 'draft-7' })
};
