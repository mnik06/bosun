import { z } from 'zod';
import {
	OnboardingAssumptionInputSchema,
	OnboardingRequirementSchema,
	OnboardingStepInputSchema
} from 'src/types/OnboardingSchema';
import { GitBranchNameSchema } from 'src/types/RepositorySchema';

export const RunIdParamsSchema = z.object({ runId: z.string().min(1) });

export const OnboardingStepReqSchema = OnboardingStepInputSchema;

export const OnboardingConfigReqSchema = z.object({ yaml: z.string().min(1).max(100_000) });

export const OnboardingConfigRespSchema = z.union([
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), issues: z.array(z.object({ path: z.string(), message: z.string() })) })
]);

export const OnboardingRequirementReqSchema = OnboardingRequirementSchema;

export const OnboardingAssumptionReqSchema = OnboardingAssumptionInputSchema;

export const OnboardingBaseBranchReqSchema = z.object({
	branch: GitBranchNameSchema,
	reason: z.string().trim().min(1).max(500)
});

export const OkRespSchema = z.object({ ok: z.literal(true) });

export const GitCredentialRespSchema = z.object({ token: z.string(), expiresAt: z.date() });
