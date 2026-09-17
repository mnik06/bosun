import { z } from 'zod';

export const CreateQuickFixReqSchema = z.object({ description: z.string().trim().min(1).max(4000) });
