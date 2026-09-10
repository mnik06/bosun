import { z } from 'zod';

// One selected plan, whole. The preparation session is the only reader that ever
// has all of them at once, and a summary is not enough to tell what two of them
// genuinely share from what merely sounds alike.
export const PreparePlanSchema = z.object({
	id: z.string(),
	number: z.number().int(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	blockedBy: z.array(z.number().int()),
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	slices: z.array(
		z.object({
			ordinal: z.number().int(),
			kind: z.enum(['build', 'verify']),
			title: z.string(),
			bodyMd: z.string().nullable()
		})
	)
});

export type PreparePlan = z.infer<typeof PreparePlanSchema>;

export const PlanPrepareMsgSchema = z.object({
	type: z.literal('plan.prepare'),
	planId: z.string(),
	planNumber: z.number().int(),
	plans: z.array(PreparePlanSchema).min(2),
	notes: z.string().nullable().default(null)
});

