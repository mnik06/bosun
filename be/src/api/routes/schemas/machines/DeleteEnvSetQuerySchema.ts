import { z } from 'zod';

export const DeleteEnvSetQuerySchema = z.object({ path: z.string() });
