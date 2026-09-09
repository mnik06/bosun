import { z } from 'zod';

// What the plan is doing, as one word, derived on read from the plan row and its
// latest queue item. Derived rather than stored because two rows already own the
// facts — a third copy is one more thing to keep in step, and the one that goes
// stale is always the one on screen.
export const PlanStateSchema = z.enum([
	'planning',
	'drafted',
	'confirmed',
	'queued',
	'running',
	'in_review',
	'failed'
]);

export type PlanState = z.infer<typeof PlanStateSchema>;
