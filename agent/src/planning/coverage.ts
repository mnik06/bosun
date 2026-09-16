import { z } from 'zod';

export const CoverageEntrySchema = z.object({
	source: z
		.string()
		.min(1)
		.describe('where the requirement came from, with a short quote — `Acceptance Criteria › Header: "…"` — or `gap (product|ui|architecture): …` for one this session found that no source states'),
	acCodes: z.array(z.string().min(1)).default([]).describe('every criterion that delivers this requirement'),
	nonGoal: z.string().min(1).optional().describe('only when no criterion delivers it: why it is out of scope, and who agreed')
});

export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;

const LISTED = 10;

function listed(items: string[]): string {
	return items.length > LISTED ? `${items.slice(0, LISTED).join('; ')}; and ${items.length - LISTED} more` : items.join('; ');
}

// A plan is built and verified against its criteria and nothing else, so a
// requirement that never became one is never built and nobody downstream finds
// out. This is the last point where that is still visible.
export function coverageRefusal(opts: { acCodes: string[]; coverage: CoverageEntry[] }): string | null {
	if (opts.coverage.length === 0) {
		return 'Refused: `coverage` is empty. List every requirement from the ticket and its sources, and every gap you found, each with the criteria that deliver it or the non-goal it became.';
	}

	const known = new Set(opts.acCodes);
	const traced = new Set(opts.coverage.flatMap((entry) => entry.acCodes));
	const uncovered = opts.coverage.filter((entry) => entry.acCodes.length === 0 && entry.nonGoal === undefined).map((entry) => entry.source);
	const unknown = [...traced].filter((code) => !known.has(code));
	const untraced = opts.acCodes.filter((code) => !traced.has(code));
	const problems = [
		uncovered.length > 0 ? `these requirements have no criterion and no non-goal: ${listed(uncovered)}` : null,
		unknown.length > 0 ? `coverage names criteria the plan does not have: ${listed(unknown)}` : null,
		untraced.length > 0 ? `these criteria trace to no requirement — add the requirement or gap each one closes: ${listed(untraced)}` : null
	].filter((problem): problem is string => problem !== null);

	return problems.length === 0 ? null : `Refused: ${problems.join('. ')}.`;
}
