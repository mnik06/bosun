import { z } from 'zod';
import { RepositorySchema } from 'src/types/RepositorySchema';

export const RepositoryIdParamsSchema = z.object({ id: z.string().min(1) });

export const SaveConfigDraftReqSchema = z.object({ yaml: z.string().min(1).max(100_000) });

export const RepositoryRespSchema = z.object({ repository: RepositorySchema });

export const RepositoryListRespSchema = z.array(RepositorySchema);

export const PullRequestRespSchema = z.object({ prUrl: z.string() });

export const RepositoryConfigRespSchema = z.object({
	defaultBranch: z.string(),
	file: z.string().nullable(),
	draft: z.string().nullable(),
	source: z.enum(['file', 'draft', 'none'])
});
