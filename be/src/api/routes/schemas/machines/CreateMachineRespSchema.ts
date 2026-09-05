import { z } from 'zod';

export const CreateMachineRespSchema = z.object({
	id: z.string(),
	name: z.string(),
	token: z.string(),
	expiresAt: z.date(),
	enrollCommand: z.string(),
	installCommand: z.string()
});

export type CreateMachineResp = z.infer<typeof CreateMachineRespSchema>;
