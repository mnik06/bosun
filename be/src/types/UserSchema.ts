import { z } from 'zod';

export const UserSchema = z.object({
	id: z.string(),
	subId: z.uuid(),
	email: z.email(),
	isAppOwner: z.boolean(),
	createdAt: z.date()
});

export type User = z.infer<typeof UserSchema>;
