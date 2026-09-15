import { z } from 'zod';

export const UnreadCountsRespSchema = z.object({
	counts: z.array(z.object({ planId: z.string(), count: z.number().int() }))
});

export type UnreadCountsResp = z.infer<typeof UnreadCountsRespSchema>;
