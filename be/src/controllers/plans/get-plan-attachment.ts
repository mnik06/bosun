import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type ChatAttachmentFile, type ChatAttachmentRepo } from 'src/repos/plans/chat-attachment.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { orNotFound } from 'src/utils/general';

export async function getPlanAttachment(opts: {
	planRepo: PlanRepo;
	chatAttachmentRepo: ChatAttachmentRepo;
	id: string;
	attachmentId: string;
	projectId: string;
}): Promise<ChatAttachmentFile> {
	const plan = await getOwnedPlan({ planRepo: opts.planRepo, id: opts.id, projectId: opts.projectId });

	return orNotFound(opts.chatAttachmentRepo.getForPlan({ id: opts.attachmentId, planId: plan.id }), 'Attachment not found');
}
