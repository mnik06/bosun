import { z } from 'zod';

export const EnrollRespSchema = z.object({
	machineId: z.string(),
	machineKey: z.string(),
	serverUrl: z.url()
});

export type EnrollResp = z.infer<typeof EnrollRespSchema>;
