import { z } from 'zod';
import { UserSchema } from 'src/types/UserSchema';

export const MeRespSchema = UserSchema.pick({
	id: true,
	email: true,
	isAppOwner: true,
	createdAt: true
});

export type MeResp = z.infer<typeof MeRespSchema>;
