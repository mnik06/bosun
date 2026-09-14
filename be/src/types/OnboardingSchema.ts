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
	detail: z.string().max(4000).nullable().default(null)
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
		evidence: z.string().trim().min(1).max(500)
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

export const OnboardingAssumptionSchema = z.object({
	text: z.string().trim().min(1).max(1000),
	evidence: z.string().trim().min(1).max(500)
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
