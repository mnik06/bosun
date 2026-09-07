import { describe, expect, it } from 'vitest';
import { AgentMsgSchema, ServerMsgSchema, UiMsgSchema } from 'src/types/protocol';

// Every union is built at import time from members declared across three files.
// A cycle between them leaves `z.discriminatedUnion` reading an undefined member
// and throws while the module loads — which takes the whole process down rather
// than one route, and does it identically in every environment except the tests
// that happen not to import this file.
describe('the protocol unions build', () => {
	it.each([
		['agent', AgentMsgSchema, { type: 'plan.text', planId: 'p_1', delta: 'x' }],
		['server', ServerMsgSchema, { type: 'plan.cancel', planId: 'p_1' }],
		['ui', UiMsgSchema, { type: 'plan.text', planId: 'p_1', delta: 'x' }]
	])('%s', (_name, schema, frame) => {
		expect(schema.safeParse(frame).success).toBe(true);
	});

	it('shares the plan stream frames between the agent and the browser', () => {
		const frame = { type: 'plan.done', planId: 'p_1' };

		expect(AgentMsgSchema.safeParse(frame).success).toBe(true);
		expect(UiMsgSchema.safeParse(frame).success).toBe(true);
	});
});
