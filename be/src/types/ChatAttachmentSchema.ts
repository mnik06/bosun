import { z } from 'zod';

// What a chat message carries for each file attached to it. The bytes live in
// `chat_attachments` and are fetched by id, so a transcript read on every page
// load never drags a screenshot along with it.
export const ChatAttachmentSchema = z.object({
	id: z.string(),
	name: z.string(),
	mediaType: z.string(),
	size: z.number().int()
});

export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

// Sized for screenshots, logs and the odd PDF, not for a repository dump: the
// whole message travels as one JSON body, and every file is handed to the session
// on the machine before its turn starts.
export const CHAT_ATTACHMENT_LIMITS = {
	maxFiles: 10,
	maxFileBytes: 10 * 1024 * 1024,
	maxTotalBytes: 20 * 1024 * 1024
};

// The first agent release that reads `attachments` off a chat frame. An older
// one strips the field and runs the turn without them, which reads to the person
// as a session that ignored the screenshot they sent.
export const CHAT_ATTACHMENT_MIN_AGENT_VERSION = '4.0.8';

// The only types served back under their own name. Anything else — SVG and HTML
// above all — is served as an opaque download, so a stored file can never run as
// a page on the API's origin.
export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
