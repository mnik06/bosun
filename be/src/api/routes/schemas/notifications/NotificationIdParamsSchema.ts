import { z } from 'zod';

export const NotificationIdParamsSchema = z.object({ id: z.string().min(1) });

export type NotificationIdParams = z.infer<typeof NotificationIdParamsSchema>;
