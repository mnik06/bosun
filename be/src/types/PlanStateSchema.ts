import { z } from 'zod';

// What the plan is doing, as one word, derived on read from the plan row and its
// latest build. Derived rather than stored because two rows already own the facts
// — a third copy is one more thing to keep in step, and the one that goes stale is
// always the one on screen.
export const PlanStateSchema = z.enum([
	'drafting',
	'needs_approval',
	'scheduled',
	'held',
	'building',
	'integrating',
	'verifying',
	'in_review',
	'fixing_bugs',
	'merged',
	'needs_you',
	'failed',
	'cancelled'
]);

export type PlanState = z.infer<typeof PlanStateSchema>;
