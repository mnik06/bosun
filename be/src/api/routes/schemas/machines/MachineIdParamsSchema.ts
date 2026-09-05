import { z } from 'zod';

export const MachineIdParamsSchema = z.object({
	id: z.string()
});

export type MachineIdParams = z.infer<typeof MachineIdParamsSchema>;
