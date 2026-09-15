import { z } from 'zod';

export const CreatePushSubscriptionReqSchema = z.object({
	endpoint: z.url(),
	keys: z.object({
		p256dh: z.string().min(1),
		auth: z.string().min(1)
	})
});

export type CreatePushSubscriptionReq = z.infer<typeof CreatePushSubscriptionReqSchema>;
