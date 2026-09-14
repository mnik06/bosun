import { z } from 'zod';
import { EnvVarInputSchema } from 'src/types/env-sets';
import { OnboardingPhaseSchema, OnboardingRequirementSchema, OnboardingRunSchema } from 'src/types/OnboardingSchema';

export const AttachRepositoryReqSchema = z.object({ githubRepoId: z.number().int().positive() });

export const AttachRepositoryRespSchema = z.object({ status: z.literal('requested') });

export const SaveMachinePolicyReqSchema = z.object({ applyMigrations: z.boolean() });

export const StartOnboardingReqSchema = z.object({ phase: OnboardingPhaseSchema });

export const OnboardingRunRespSchema = z.object({ run: OnboardingRunSchema });

export const MachineOnboardingRespSchema = z.object({
	run: OnboardingRunSchema,
	missing: z.array(OnboardingRequirementSchema)
});

export const SaveSessionSecretsReqSchema = z.object({ vars: z.array(EnvVarInputSchema).max(50) });
