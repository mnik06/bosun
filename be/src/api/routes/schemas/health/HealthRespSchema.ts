import { z } from 'zod';

export const HealthRespSchema = z.object({
	status: z.literal('ok')
});

export type HealthResp = z.infer<typeof HealthRespSchema>;
