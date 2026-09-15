import { z } from 'zod';

export const DeletePushSubscriptionReqSchema = z.object({ endpoint: z.url() });

export type DeletePushSubscriptionReq = z.infer<typeof DeletePushSubscriptionReqSchema>;
