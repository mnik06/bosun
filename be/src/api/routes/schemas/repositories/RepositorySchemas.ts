import { z } from 'zod';
import { GitBranchNameSchema, RepositorySchema } from 'src/types/RepositorySchema';

export const RepositoryIdParamsSchema = z.object({ id: z.string().min(1) });

export const SaveConfigReqSchema = z.object({ text: z.string().min(1).max(100_000) });

// Null goes back to the provider's default branch.
export const SaveDefaultBranchReqSchema = z.object({ branch: GitBranchNameSchema.nullable() });

export const RepositoryRespSchema = z.object({ repository: RepositorySchema });

export const RepositoryListRespSchema = z.array(RepositorySchema);

export const RepositoryConfigRespSchema = z.object({ config: z.string().nullable() });
