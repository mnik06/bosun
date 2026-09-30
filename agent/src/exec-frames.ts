import { z } from 'zod';
import { RunPolicySchema } from './onboarding-frames';
import { PlanAnswerSchema, PlanQuestionSchema } from './plan-frames';
import { ProjectProfileSchema } from './project-profile';

export const ExecSliceSchema = z.object({
	ordinal: z.number().int(),
	kind: z.enum(['build', 'verify']),
	title: z.string(),
	bodyMd: z.string().nullable()
});

export const ExecFindingSchema = z.object({
	id: z.string(),
	acCode: z.string().nullable(),
	kind: z.enum(['criterion', 'console', 'network', 'visual']),
	reproduction: z.string(),
	severity: z.enum(['high', 'medium', 'low'])
});

export type ExecFinding = z.infer<typeof ExecFindingSchema>;

export const ExecPriorProposalSchema = z.object({
	title: z.string(),
	input: z.string(),
	status: z.enum(['open', 'dismissed'])
});

export type ExecPriorProposal = z.infer<typeof ExecPriorProposalSchema>;

// Null on a build bullet. A verify slice runs as several sessions: a drive in the
// lane, a fix in a build slot, and a re-check of what the fix repaired.
export const RunPhaseSchema = z.enum(['drive', 'fix', 'recheck']);

// Everything the session needs travels in the frame. The agent holds no plan
// state of its own, so a slice dispatched after a reconnect needs no lookup and
// no cache that could disagree with the row the backend scheduled from.
export const ExecStartMsgSchema = z.object({
	type: z.literal('exec.start'),
	runId: z.string(),
	buildId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	// An AFK plan's bullets are given no way to ask.
	afk: z.boolean(),
	planId: z.string(),
	sliceId: z.string(),
	planNumber: z.number().int(),
	planTitle: z.string(),
	planBodyMd: z.string(),
	// A machine with no repository runs on the profile edited in the browser. A
	// repository machine runs on the config bosun holds for it, and takes
	// `policy` — the one environment fact the config never holds, and only the
	// lane's — from here.
	profile: ProjectProfileSchema,
	config: z.string().nullable().default(null),
	policy: RunPolicySchema.nullable().default(null),
	portBase: z.number().int(),
	slice: ExecSliceSchema,
	phase: RunPhaseSchema.nullable(),
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	// Every criterion in the plan, not only this bullet's — a verify session is
	// measured against the whole feature.
	planAcs: z.array(z.object({ code: z.string(), text: z.string() })),
	decisions: z.array(z.object({ fork: z.string(), chose: z.string() })),
	doneSlices: z.array(z.object({ ordinal: z.number().int(), title: z.string() })),
	// What bosun changed about this plan to fit the others: standing instruction.
	amendments: z.array(z.string()),
	// Provider branches merged in before the bullet, so a stacked plan builds on
	// whatever its provider gained since it started.
	mergeIn: z.array(z.string()),
	// Push the branch after committing.
	push: z.boolean(),
	// A bullet restarted after its question was answered.
	answer: z
		.object({ questions: z.array(PlanQuestionSchema), answers: z.array(PlanAnswerSchema) })
		.nullable(),
	findings: z.array(ExecFindingSchema),
	// What fix sessions already proposed for this repository and nobody started.
	// Defaulted so a frame from a backend that predates proposals still parses.
	priorProposals: z.array(ExecPriorProposalSchema).default([]),
	// The criteria a re-check drives, or a fix-again session is limited to. Empty on
	// a first fix, which is how that session knows the codebase sweep is still its job.
	recheckCodes: z.array(z.string()),
	// The most memory this session may use, chosen by the scheduler so the limits
	// of everything running fit the machine. Null when the machine has not
	// reported its memory; the session is then limited to what the machine can spare.
	memoryMaxBytes: z.number().int().positive().nullable().default(null)
});

export const ExecCancelMsgSchema = z.object({ type: z.literal('exec.cancel'), runId: z.string() });

export const ExecAnswerMsgSchema = z.object({
	type: z.literal('exec.answer'),
	runId: z.string(),
	questionId: z.string(),
	answers: z.array(PlanAnswerSchema).min(1)
});

export type ExecStart = z.infer<typeof ExecStartMsgSchema>;
