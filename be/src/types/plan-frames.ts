import { z } from 'zod';
import { FootprintSchema } from 'src/types/FootprintSchema';
import { PlanAnswerSchema } from 'src/types/PlanSchema';

export const PlanStartMsgSchema = z.object({
	type: z.literal('plan.start'),
	planId: z.string(),
	input: z.string(),
	verifyInUi: z.boolean().default(true),
	// The grill answers itself: the session takes its own recommendation instead of
	// stopping for a person who is not there.
	auto: z.boolean().default(false),
	// The operator's notes from the machine's project setup. Planning gets them
	// for the same reason execution does: a convention nobody can read off the
	// code — a skill this repository expects a session to invoke, a rule the team
	// keeps in its head — is exactly what a session cannot discover for itself.
	notes: z.string().nullable().default(null),
	// The repository's draft, for a read tree that has no `.bosun/project.yaml`.
	configDraft: z.string().nullable().default(null)
});

// The published plan as it stands, carried on the frame rather than fetched:
// the agent keeps no plan state, so a revision session that starts an hour after
// the grill ended needs the artifact handed to it.
export const PlanSnapshotSchema = z.object({
	verifyInUi: z.boolean(),
	auto: z.boolean(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	acs: z.array(
		z.object({
			code: z.string(),
			text: z.string(),
			sliceOrdinal: z.number().int().nullable()
		})
	),
	slices: z.array(
		z.object({
			ordinal: z.number().int(),
			kind: z.enum(['build', 'verify']),
			title: z.string(),
			bodyMd: z.string().nullable(),
			foundation: z.boolean(),
			footprint: FootprintSchema
		})
	)
});

// A line the person typed into the plan's chat. It reaches a live session as
// another turn on its stdin; when the session is already over it starts a
// revision session with the published plan in front of it.
export const PlanSayMsgSchema = z.object({
	type: z.literal('plan.say'),
	planId: z.string(),
	text: z.string(),
	notes: z.string().nullable().default(null),
	configDraft: z.string().nullable().default(null),
	plan: PlanSnapshotSchema
});

export const PlanAnswerMsgSchema = z.object({
	type: z.literal('plan.answer'),
	planId: z.string(),
	questionId: z.string(),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const PlanCancelMsgSchema = z.object({
	type: z.literal('plan.cancel'),
	planId: z.string()
});
