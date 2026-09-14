import { z } from 'zod';

export const EnrollReqSchema = z.object({
	token: z.string().min(1),
	hostname: z.string().min(1),
	// Only an agent enrolled onto an existing checkout sends one. Under plan 008 the
	// agent clones the repository it is attached to, and where the installer ran
	// has no bearing on what the machine works on.
	repoPath: z.string().min(1).optional()
});

export type EnrollReq = z.infer<typeof EnrollReqSchema>;
