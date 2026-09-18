import { readBlobAsBase64 } from '~/shared/lib'

// Mirrors `CHAT_ATTACHMENT_LIMITS` in `be/src/types/ChatAttachmentSchema.ts`,
// which refuses anything past them regardless.
export const CHAT_ATTACHMENT_LIMITS = {
	maxFiles: 10,
	maxFileBytes: 10 * 1024 * 1024,
	maxTotalBytes: 20 * 1024 * 1024
}

// The types the backend serves back as an image. Anything else — SVG included —
// comes back as an opaque download and is shown as a file.
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function isShownImage (mediaType: string): boolean {
	return IMAGE_TYPES.has(mediaType)
}

export async function encodeChatAttachments (files: File[]): Promise<{ name: string, mediaType: string, data: string }[]> {
	return Promise.all(
		files.map(async (file) => ({ name: file.name, mediaType: file.type, data: await readBlobAsBase64(file) }))
	)
}
