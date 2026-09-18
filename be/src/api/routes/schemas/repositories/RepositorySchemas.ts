import { z } from 'zod';
import { GitBranchNameSchema, RepositorySchema } from 'src/types/RepositorySchema';

export const RepositoryIdParamsSchema = z.object({ id: z.string().min(1) });

export const SaveConfigDraftReqSchema = z.object({ yaml: z.string().min(1).max(100_000) });

// Null goes back to the provider's default branch.
export const SaveDefaultBranchReqSchema = z.object({ branch: GitBranchNameSchema.nullable() });

export const RepositoryRespSchema = z.object({ repository: RepositorySchema });

export const RepositoryListRespSchema = z.array(RepositorySchema);

export const PullRequestRespSchema = z.object({ prUrl: z.string() });

export const RepositoryConfigRespSchema = z.object({
	defaultBranch: z.string(),
	file: z.string().nullable(),
	draft: z.string().nullable(),
	source: z.enum(['file', 'draft', 'none'])
});
