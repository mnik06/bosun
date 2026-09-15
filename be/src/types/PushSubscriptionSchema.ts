import { z } from 'zod';

export const PushSubscriptionSchema = z.object({
	id: z.string(),
	userId: z.string(),
	endpoint: z.string(),
	p256dh: z.string(),
	auth: z.string(),
	createdAt: z.coerce.date()
});

export type PushSubscription = z.infer<typeof PushSubscriptionSchema>;
