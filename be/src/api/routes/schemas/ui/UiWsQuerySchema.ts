import { z } from 'zod';

export const UiWsQuerySchema = z.object({
	ticket: z.string().min(1)
});

export type UiWsQuery = z.infer<typeof UiWsQuerySchema>;
