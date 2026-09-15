import { z } from 'zod';

export const NotificationListQuerySchema = z.object({
	unread: z.literal('true').optional(),
	limit: z.coerce.number().int().min(1).max(100).optional()
});

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
