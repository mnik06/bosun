import { z } from 'zod';

export const CreatePushSubscriptionRespSchema = z.object({
	subscription: z.object({
		id: z.string(),
		endpoint: z.string(),
		createdAt: z.date()
	})
});

export type CreatePushSubscriptionResp = z.infer<typeof CreatePushSubscriptionRespSchema>;
