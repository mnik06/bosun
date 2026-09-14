import { z } from 'zod';

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const OnboardingPhaseSchema = z.enum(['discover', 'verify']);

export type OnboardingPhase = z.infer<typeof OnboardingPhaseSchema>;

export const OnboardingStatusSchema = z.enum([
	'discovering',
	'needs_input',
	'verifying',
	'ready',
	'failed'
]);

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

export const OnboardingStepStatusSchema = z.enum(['info', 'running', 'passed', 'failed']);

export const OnboardingStepInputSchema = z.object({
	label: z.string().trim().min(1).max(200),
	status: OnboardingStepStatusSchema,
	detail: z.string().max(4000).nullable().default(null),
	// How far through its phase the run is, 0 to 1. Exact for verify, whose steps
	// are known before it starts; an estimate for discovery, which is a session.
	// Null on a step that says nothing about it.
	progress: z.number().min(0).max(1).nullable().default(null)
});

export const OnboardingStepSchema = OnboardingStepInputSchema.extend({ at: z.string() });

export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

// Flat rather than a union so the session's tool schema stays one object a model
// can fill in. The refinement is what the union would have enforced.
export const OnboardingRequirementSchema = z
	.object({
		kind: z.enum(['env', 'secret', 'policy']),
		path: z.string().max(200).nullable().default(null),
		key: z.string().min(1).max(100),
		why: z.string().trim().min(1).max(1000),
		evidence: z.string().trim().min(1).max(500),
		optional: z.boolean().optional()
	})
	.superRefine((requirement, ctx) => {
		if (requirement.kind === 'env' && requirement.path === null) {
			ctx.addIssue({ code: 'custom', path: ['path'], message: 'an env requirement names the folder its .env lives in' });
		}

		if (requirement.kind !== 'policy' && !ENV_KEY.test(requirement.key)) {
			ctx.addIssue({ code: 'custom', path: ['key'], message: 'must be an env variable name' });
		}

		if (requirement.kind === 'policy' && requirement.key !== 'applyMigrations') {
			ctx.addIssue({ code: 'custom', path: ['key'], message: 'the only policy is applyMigrations' });
		}
	});

export type OnboardingRequirement = z.infer<typeof OnboardingRequirementSchema>;

const LEGACY_OPTIONAL = /^\s*optional\b/i;

// An optional input never holds verify back. Agents older than the flag could
// only say so in prose, and they did — "Optional; absent disables Sentry" — so a
// requirement that carries no flag is read from how its reason opens.
export function isOptionalRequirement(requirement: OnboardingRequirement): boolean {
	return requirement.optional ?? LEGACY_OPTIONAL.test(requirement.why);
}

export const OnboardingAssumptionSchema = z.object({
	text: z.string(),
	evidence: z.string()
});

// Short on purpose. An assumption is read by a person deciding whether discovery
// understood their project, in a list; a paragraph each is a list nobody reads.
// The limit is what holds a session to one sentence — a longer one comes back to
// it as a refused tool call it has to rewrite. Only what arrives is held to it:
// runs recorded before it keep their longer lines, and re-parsing them must not
// turn a report into a 500.
export const OnboardingAssumptionInputSchema = z.object({
	text: z.string().trim().min(1).max(240),
	evidence: z.string().trim().min(1).max(120)
});

export type OnboardingAssumption = z.infer<typeof OnboardingAssumptionSchema>;

export const OnboardingRunSchema = z.object({
	id: z.string(),
	repositoryId: z.string(),
	machineId: z.string(),
	phase: OnboardingPhaseSchema,
	status: OnboardingStatusSchema,
	portBase: z.number().int().nullable(),
	steps: z.array(OnboardingStepSchema),
	requirements: z.array(OnboardingRequirementSchema),
	assumptions: z.array(OnboardingAssumptionSchema),
	// The config this run published, kept beside the draft it became so a report
	// can show what the run concluded after the draft has been edited since.
	config: z.string().nullable(),
	failureReason: z.string().nullable(),
	startedAt: z.date(),
	finishedAt: z.date().nullable()
});

export type OnboardingRun = z.infer<typeof OnboardingRunSchema>;

export const MachinePolicySchema = z.object({
	applyMigrations: z.boolean(),
	// Whether a person has chosen, as opposed to the column's default. A discovery
	// that lists the migration policy as an input is satisfied only by a choice.
	confirmed: z.boolean().default(false)
});

export type MachinePolicy = z.infer<typeof MachinePolicySchema>;

export const DEFAULT_MACHINE_POLICY: MachinePolicy = { applyMigrations: true, confirmed: false };
