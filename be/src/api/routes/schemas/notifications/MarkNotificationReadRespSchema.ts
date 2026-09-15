import { z } from 'zod';
import { NotificationSchema } from 'src/types/NotificationSchema';

export const MarkNotificationReadRespSchema = z.object({ notification: NotificationSchema });

export type MarkNotificationReadResp = z.infer<typeof MarkNotificationReadRespSchema>;
