import { z } from 'zod';

// Mirrors `be/src/types/ChatAttachmentSchema.ts`. A chat frame carries the file by
// reference; its bytes are fetched from `/agent/attachments/:id` when the turn is
// handed to the session — see `services/attachments.service.ts`.
export const ChatAttachmentSchema = z.object({
	id: z.string(),
	name: z.string(),
	mediaType: z.string(),
	size: z.number().int()
});

export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;
