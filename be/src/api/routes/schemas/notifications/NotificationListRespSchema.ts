import { z } from 'zod';
import { NotificationSchema } from 'src/types/NotificationSchema';

export const NotificationListRespSchema = z.object({
	notifications: z.array(NotificationSchema)
});

export type NotificationListResp = z.infer<typeof NotificationListRespSchema>;
