import { z } from 'zod';

export const RefreshMachineRespSchema = z.object({
	status: z.literal('requested')
});

export type RefreshMachineResp = z.infer<typeof RefreshMachineRespSchema>;
