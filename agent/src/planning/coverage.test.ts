import { describe, expect, it } from 'vitest';
import { coverageRefusal, withCoverage, type CoverageEntry } from './coverage';

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

describe('withCoverage', () => {
	it('appends the ledger as a table, escaping what would break a row', () => {
		const body = withCoverage('# Plan\n\n## Non-goals\n\nNone.', [
			entry({ source: 'a | b\nc', acCodes: ['AC-1', 'AC-2'] }),
			entry({ source: 'd', nonGoal: 'later' })
		]);

		expect(body).toContain('## Non-goals\n\nNone.\n\n## Requirements coverage');
		expect(body).toContain('| a \\| b c | AC-1, AC-2 |');
		expect(body).toContain('| d | Non-goal: later |');
	});

	it('replaces the ledger a revision was handed rather than adding a second one', () => {
		const first = withCoverage('# Plan', [entry({ source: 'old', acCodes: ['AC-1'] })]);
		const revised = withCoverage(`${first}\n## Blockers & dependencies\n\nNone.`, [entry({ source: 'new', acCodes: ['AC-1'] })]);

		expect(revised.match(/## Requirements coverage/g)).toHaveLength(1);
		expect(revised).not.toContain('| old |');
		expect(revised).toContain('| new |');
		expect(revised).toContain('## Blockers & dependencies');
	});
});
