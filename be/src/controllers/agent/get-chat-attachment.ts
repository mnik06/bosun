import { type ChatAttachmentFile, type ChatAttachmentRepo } from 'src/repos/plans/chat-attachment.repo';
import { orNotFound } from 'src/utils/general';

// What a chat frame's `attachments` point at: the session's machine fetches each
// file before it hands the turn to `claude`.
export async function getChatAttachmentForAgent(opts: {
	chatAttachmentRepo: ChatAttachmentRepo;
	id: string;
	projectId: string;
}): Promise<ChatAttachmentFile> {
	return orNotFound(opts.chatAttachmentRepo.getForProject({ id: opts.id, projectId: opts.projectId }), 'Attachment not found');
}
