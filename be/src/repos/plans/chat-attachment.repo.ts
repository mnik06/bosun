import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { chatAttachments, plans } from 'src/services/drizzle/schema';
import { ChatAttachmentSchema, type ChatAttachment } from 'src/types/ChatAttachmentSchema';

const metaColumns = {
	id: chatAttachments.id,
	name: chatAttachments.name,
	mediaType: chatAttachments.mediaType,
	size: chatAttachments.size
};

const fileColumns = { ...metaColumns, data: chatAttachments.data };

const ChatAttachmentFileSchema = ChatAttachmentSchema.extend({ data: z.instanceof(Buffer) });

export type ChatAttachmentFile = z.infer<typeof ChatAttachmentFileSchema>;

export function getChatAttachmentRepo(db: DbOrTx) {
	return {
		async insertMany(opts: {
			planId: string;
			files: { id: string; name: string; mediaType: string; data: Buffer }[];
		}): Promise<ChatAttachment[]> {
			const rows = await db
				.insert(chatAttachments)
				.values(opts.files.map((file) => ({ ...file, planId: opts.planId, size: file.data.length })))
				.returning(metaColumns);

			return rows.map((row) => ChatAttachmentSchema.parse(row));
		},

		async getForPlan(opts: { id: string; planId: string }): Promise<ChatAttachmentFile | null> {
			const [row] = await db
				.select(fileColumns)
				.from(chatAttachments)
				.where(and(eq(chatAttachments.id, opts.id), eq(chatAttachments.planId, opts.planId)));

			return row ? ChatAttachmentFileSchema.parse(row) : null;
		},

		// Scoped through the plan to the project, the only ownership a machine key
		// carries: any machine of the project can be the one a plan's chat or its
		// build runs on.
		async getForProject(opts: { id: string; projectId: string }): Promise<ChatAttachmentFile | null> {
			const [row] = await db
				.select(fileColumns)
				.from(chatAttachments)
				.innerJoin(plans, eq(plans.id, chatAttachments.planId))
				.where(and(eq(chatAttachments.id, opts.id), eq(plans.projectId, opts.projectId)));

			return row ? ChatAttachmentFileSchema.parse(row) : null;
		}
	};
}

export type ChatAttachmentRepo = ReturnType<typeof getChatAttachmentRepo>;
