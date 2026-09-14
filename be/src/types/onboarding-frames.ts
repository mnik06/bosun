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
	repoPath: z.string(),
	configOnDefault: z.boolean()
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
	// Null when the repository has no draft. A tree carrying the file uses the
	// file; the draft is only ever the fallback for a tree that has none.
	configDraft: z.string().nullable(),
	// Set for the verify that follows a discovery. A discovery on a repository that
	// already has `.bosun/project.yaml` publishes a proposed change to it, and the
	// pull request that follows must carry a config somebody watched run — not the
	// file it would replace.
	preferDraft: z.boolean().default(false),
	applyMigrations: z.boolean(),
	memoryMaxBytes: z.number().int().positive().nullable()
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
