import { z } from 'zod';

// Mirrors `be/src/types/onboarding-frames.ts` and the sealed-value half of
// `be/src/types/env-sets.ts`. Kept out of `protocol.ts` only for its length.

export const SealedValueSchema = z.object({
	v: z.literal(1),
	wrappedKey: z.string().min(1).max(1024),
	iv: z.string().min(1).max(64),
	ciphertext: z.string().min(1).max(60_000)
});

export type SealedValue = z.infer<typeof SealedValueSchema>;

export const RepoAttachMsgSchema = z.object({
	type: z.literal('repo.attach'),
	repositoryId: z.string(),
	cloneUrl: z.string(),
	defaultBranch: z.string(),
	slug: z.string()
});

export type RepoAttach = z.infer<typeof RepoAttachMsgSchema>;

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
	phase: z.enum(['discover', 'verify']),
	portBase: z.number().int(),
	configDraft: z.string().nullable(),
	// Set for the verify that follows a discovery: it proves the config that
	// discovery published, even where the default branch already carries a file.
	preferDraft: z.boolean().default(false),
	applyMigrations: z.boolean(),
	memoryMaxBytes: z.number().int().positive().nullable(),
	// The branch the scratch checkout is cut from. Absent from a backend older than
	// base branches, which only ever meant the clone's `origin/HEAD`.
	baseBranch: z.string().optional()
});

export type OnboardingStart = z.infer<typeof OnboardingStartMsgSchema>;

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
