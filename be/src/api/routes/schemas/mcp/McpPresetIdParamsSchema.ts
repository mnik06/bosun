import { z } from 'zod';

export const McpPresetIdParamsSchema = z.object({ id: z.string().min(1) });
