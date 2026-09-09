import { z } from 'zod';

// A map of the branch, not a changelog. The point is that somebody opening it
// understands what moved without reading the diff, so it is ranked and grouped
// rather than complete — an entry earns its place by being one a reviewer would
// be lost without.
export const PlanSummaryEntrySchema = z.object({
	path: z.string(),
	kind: z.enum(['added', 'changed', 'removed']),
	note: z.string()
});

export type PlanSummaryEntry = z.infer<typeof PlanSummaryEntrySchema>;

export const PlanSummaryAreaSchema = z.object({
	name: z.string(),
	why: z.string(),
	entries: z.array(PlanSummaryEntrySchema)
});

export type PlanSummaryArea = z.infer<typeof PlanSummaryAreaSchema>;

export const PlanSummarySchema = z.object({
	headline: z.string(),
	areas: z.array(PlanSummaryAreaSchema)
});

export type PlanSummary = z.infer<typeof PlanSummarySchema>;
