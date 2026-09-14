import { z } from 'zod';

export const EnrollRespSchema = z.object({
	machineId: z.string(),
	machineKey: z.string(),
	serverUrl: z.url(),
	// Where `bosun-agent setup` sends the operator when it is done.
	appUrl: z.url()
});

export type EnrollResp = z.infer<typeof EnrollRespSchema>;
