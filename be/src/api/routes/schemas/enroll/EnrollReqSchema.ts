import { z } from 'zod';

export const EnrollReqSchema = z.object({
	token: z.string().min(1),
	hostname: z.string().min(1),
	repoPath: z.string().min(1)
});

export type EnrollReq = z.infer<typeof EnrollReqSchema>;
