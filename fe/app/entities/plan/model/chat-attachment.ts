import { z } from 'zod'

// A file a person attached to a turn in the plan's chat or its bug-fixing chat.
// The message carries this reference; the bytes are fetched on their own.
export const ChatAttachmentSchema = z.object({
	id: z.string(),
	name: z.string(),
	mediaType: z.string(),
	size: z.number()
})

export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>
