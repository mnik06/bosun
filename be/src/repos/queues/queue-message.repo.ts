import { asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { queueMessages } from 'src/services/drizzle/schema';
import { QueueMessageSchema, type QueueMessage, type QueueMessageRole } from 'src/types/QueueSchema';

const columns = {
	id: queueMessages.id,
	queueId: queueMessages.queueId,
	role: queueMessages.role,
	content: queueMessages.content,
	createdAt: queueMessages.createdAt
};

export function getQueueMessageRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			queueId: string;
			role: QueueMessageRole;
			content: string;
		}): Promise<QueueMessage> {
			const [row] = await db.insert(queueMessages).values(opts).returning(columns);

			return QueueMessageSchema.parse(row);
		},

		async listForQueue(queueId: string): Promise<QueueMessage[]> {
			const rows = await db
				.select(columns)
				.from(queueMessages)
				.where(eq(queueMessages.queueId, queueId))
				.orderBy(asc(queueMessages.createdAt));

			return rows.map((row) => QueueMessageSchema.parse(row));
		}
	};
}

export type QueueMessageRepo = ReturnType<typeof getQueueMessageRepo>;
