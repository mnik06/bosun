import { z } from 'zod';

export const UiTicketRespSchema = z.object({
	ticket: z.string(),
	expiresAt: z.date()
});

export type UiTicketResp = z.infer<typeof UiTicketRespSchema>;
