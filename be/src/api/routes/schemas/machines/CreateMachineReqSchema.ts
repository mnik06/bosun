import { z } from 'zod';

export const CreateMachineReqSchema = z.object({
	name: z.string().trim().min(1).max(80)
});

export type CreateMachineReq = z.infer<typeof CreateMachineReqSchema>;
