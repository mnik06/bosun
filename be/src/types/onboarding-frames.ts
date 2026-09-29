import { z } from 'zod';
import { OnboardingPhaseSchema } from 'src/types/OnboardingSchema';

// The agent clones with a credential it asks bosun for on every fetch, so the
// frame carries where to clone from and nothing that authenticates.
export const RepoAttachMsgSchema = z.object({
	type: z.literal('repo.attach'),
	repositoryId: z.string(),
	cloneUrl: z.string(),
	defaultBranch: z.string(),
	slug: z.string()
});

export const RepoAttachedMsgSchema = z.object({
	type: z.literal('repo.attached'),
	repositoryId: z.string(),
	repoPath: z.string()
});

export const RepoErrorMsgSchema = z.object({
	type: z.literal('repo.error'),
	repositoryId: z.string(),
	message: z.string()
});

export const OnboardingStartMsgSchema = z.object({
	type: z.literal('onboarding.start'),
	runId: z.string(),
	phase: OnboardingPhaseSchema,
	portBase: z.number().int(),
	// Null when the repository has no config yet.
	config: z.string().nullable(),
	applyMigrations: z.boolean(),
	memoryMaxBytes: z.number().int().positive().nullable(),
	// The branch the scratch checkout is cut from — bosun's default branch, which a
	// leader may have pointed away from the provider's. Named rather than left to
	// the clone's `origin/HEAD`, which moves only once a re-sent attach lands.
	baseBranch: z.string()
});

export const OnboardingCancelMsgSchema = z.object({
	type: z.literal('onboarding.cancel'),
	runId: z.string()
});

export const OnboardingDoneMsgSchema = z.object({
	type: z.literal('onboarding.done'),
	runId: z.string()
});

export const OnboardingErrorMsgSchema = z.object({
	type: z.literal('onboarding.error'),
	runId: z.string(),
	message: z.string()
});

export const RunPolicySchema = z.object({ applyMigrations: z.boolean() });
