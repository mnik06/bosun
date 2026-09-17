import { describe, expect, it } from 'vitest';
import { quickFixSummary } from 'src/controllers/quick-fixes/shared/quick-fix-text';

describe('quickFixSummary', () => {
	it('takes the first line of the description', () => {
		expect(quickFixSummary('the button is unreadable\n\nSteps to reproduce:\n1. ...')).toBe('the button is unreadable');
	});

	it('truncates a long first line with an ellipsis', () => {
		const long = 'a'.repeat(200);

		expect(quickFixSummary(long)).toBe(`${'a'.repeat(71)}…`);
	});

	it('returns an empty string for a blank description', () => {
		expect(quickFixSummary('   ')).toBe('');
	});
});
