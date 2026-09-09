import { describe, expect, it } from 'vitest';
import { planningPrompt } from './planning';

describe('operator notes', () => {
	it('reaches the planning prompt when the machine has them', () => {
		const prompt = planningPrompt({
			input: 'ticket',
			verifyInUi: true,
			auto: false,
			notes: 'Invoke the design skill for any screen work.'
		});

		expect(prompt).toContain('Operator notes');
		expect(prompt).toContain('Invoke the design skill for any screen work.');
		expect(prompt).not.toContain('{{OPERATOR_NOTES}}');
	});

	it('leaves no placeholder behind when there are none', () => {
		const prompt = planningPrompt({ input: 'ticket', verifyInUi: true, auto: false, notes: null });

		expect(prompt).not.toContain('Operator notes');
		expect(prompt).not.toContain('{{OPERATOR_NOTES}}');
	});
});
