import { describe, expect, it } from 'vitest';
import { coverageRefusal, type CoverageEntry } from './coverage';

const entry = (overrides: Partial<CoverageEntry>): CoverageEntry => ({ source: 'Header: "shows the CPN"', acCodes: [], ...overrides });

describe('coverageRefusal', () => {
	it('accepts a ledger where every requirement is delivered or ruled out and every criterion traces', () => {
		expect(
			coverageRefusal({
				acCodes: ['AC-1', 'AC-2'],
				coverage: [
					entry({ acCodes: ['AC-1'] }),
					entry({ source: 'gap (ui): empty state', acCodes: ['AC-2'] }),
					entry({ source: 'Card 5: MRP values', nonGoal: 'waits on the MRP engine, agreed' })
				]
			})
		).toBeNull();
	});

	it('refuses an empty ledger', () => {
		expect(coverageRefusal({ acCodes: ['AC-1'], coverage: [] })).toContain('empty');
	});

	it('names a requirement with neither a criterion nor a non-goal', () => {
		const refusal = coverageRefusal({
			acCodes: ['AC-1'],
			coverage: [entry({ acCodes: ['AC-1'] }), entry({ source: 'Header: "no Where Used link"' })]
		});

		expect(refusal).toContain('no criterion and no non-goal');
		expect(refusal).toContain('no Where Used link');
	});

	it('refuses a ledger naming a criterion the plan does not have', () => {
		expect(coverageRefusal({ acCodes: ['AC-1'], coverage: [entry({ acCodes: ['AC-1', 'AC-9'] })] })).toContain('AC-9');
	});

	it('refuses a criterion no requirement traces to', () => {
		const refusal = coverageRefusal({ acCodes: ['AC-1', 'AC-2'], coverage: [entry({ acCodes: ['AC-1'] })] });

		expect(refusal).toContain('trace to no requirement');
		expect(refusal).toContain('AC-2');
	});

	it('shortens a long list instead of dumping every source', () => {
		const coverage = Array.from({ length: 14 }, (_, index) => entry({ source: `requirement ${index}` }));

		expect(coverageRefusal({ acCodes: [], coverage })).toContain('and 4 more');
	});
});
