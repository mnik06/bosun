import { z } from 'zod';
import { EnvVarInputSchema } from 'src/types/env-sets';

export const SaveEnvSetReqSchema = z.object({
	path: z.string(),
	vars: z.array(EnvVarInputSchema).min(1)
});
