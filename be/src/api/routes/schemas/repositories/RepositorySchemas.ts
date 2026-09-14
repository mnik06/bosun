import { z } from 'zod';
import { OnboardingRunSchema } from 'src/types/OnboardingSchema';
import { RepositorySchema } from 'src/types/RepositorySchema';

export const RepositoryIdParamsSchema = z.object({ id: z.string().min(1) });

export const AddRepositoryReqSchema = z.object({ githubRepoId: z.number().int().positive() });

export const SaveConfigDraftReqSchema = z.object({ yaml: z.string().min(1).max(100_000) });

export const RepositoryRespSchema = z.object({ repository: RepositorySchema });

export const RepositoryListRespSchema = z.array(RepositorySchema);

export const PullRequestRespSchema = z.object({ prUrl: z.string() });

export const RepositoryOnboardingRespSchema = z.object({
	discovery: OnboardingRunSchema.nullable(),
	runs: z.array(OnboardingRunSchema)
});
