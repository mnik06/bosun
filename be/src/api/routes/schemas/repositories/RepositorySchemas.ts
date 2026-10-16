import { z } from 'zod';
import { GitBranchNameSchema, RepositorySchema } from 'src/types/RepositorySchema';

export const RepositoryIdParamsSchema = z.object({ id: z.string().min(1) });

// Free text; empty clears them.
export const SaveInstructionsReqSchema = z.object({ text: z.string().trim().max(10_000) });

// Null goes back to the provider's default branch.
export const SaveDefaultBranchReqSchema = z.object({ branch: GitBranchNameSchema.nullable() });

export const RepositoryRespSchema = z.object({ repository: RepositorySchema });

export const RepositoryListRespSchema = z.array(RepositorySchema);

// `stale` when the instructions changed since the config was compiled from them.
export const RepositoryConfigRespSchema = z.object({ config: z.string().nullable(), instructions: z.string().nullable(), stale: z.boolean() });

export const SaveInstructionsRespSchema = z.object({
	repository: RepositorySchema,
	regeneration: z.discriminatedUnion('started', [
		z.object({ started: z.literal(true) }),
		z.object({ started: z.literal(false), reason: z.string() })
	])
});
