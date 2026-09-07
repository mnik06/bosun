import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { queueItems } from 'src/services/drizzle/schema';
import { QueueItemSchema, type QueueItem, type QueueItemStatus } from 'src/types/QueueSchema';

const columns = {
	id: queueItems.id,
	queueId: queueItems.queueId,
	planId: queueItems.planId,
	ordinal: queueItems.ordinal,
	branch: queueItems.branch,
	status: queueItems.status,
	prUrl: queueItems.prUrl,
	failureReason: queueItems.failureReason,
	startedAt: queueItems.startedAt,
	finishedAt: queueItems.finishedAt
};

export function getQueueItemRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			queueId: string;
			planId: string;
			ordinal: number;
		}): Promise<QueueItem> {
			const [row] = await db.insert(queueItems).values(opts).returning(columns);

			return QueueItemSchema.parse(row);
		},

		// `max(ordinal) + 1` rather than a count: an item removed from the middle
		// would otherwise hand out an ordinal that is already taken.
		async nextOrdinal(queueId: string): Promise<number> {
			const [row] = await db
				.select({ next: sql<number>`coalesce(max(${queueItems.ordinal}), 0) + 1` })
				.from(queueItems)
				.where(eq(queueItems.queueId, queueId));

			return Number(row?.next ?? 1);
		},

		async listForQueue(queueId: string): Promise<QueueItem[]> {
			const rows = await db
				.select(columns)
				.from(queueItems)
				.where(eq(queueItems.queueId, queueId))
				.orderBy(asc(queueItems.ordinal));

			return rows.map((row) => QueueItemSchema.parse(row));
		},

		async getById(id: string): Promise<QueueItem | null> {
			const [row] = await db.select(columns).from(queueItems).where(eq(queueItems.id, id));

			return row ? QueueItemSchema.parse(row) : null;
		},

		// The status transition is the claim. Two schedulers racing to start the
		// same queue both run this, and only the one whose UPDATE matches a `queued`
		// row gets an item back — which is what stops a plan being dispatched twice.
		async claimNext(queueId: string): Promise<QueueItem | null> {
			const [row] = await db
				.update(queueItems)
				.set({ status: 'running', startedAt: new Date() })
				.where(
					and(
						eq(queueItems.queueId, queueId),
						eq(queueItems.status, 'queued'),
						eq(
							queueItems.id,
							sql`(select id from ${queueItems} where queue_id = ${queueId} and status = 'queued' order by ordinal asc limit 1)`
						)
					)
				)
				.returning(columns);

			return row ? QueueItemSchema.parse(row) : null;
		},

		async update(opts: {
			id: string;
			status?: QueueItemStatus;
			branch?: string | null;
			prUrl?: string | null;
			failureReason?: string | null;
			finishedAt?: Date | null;
		}): Promise<QueueItem | null> {
			const { id, ...changes } = opts;
			const [row] = await db
				.update(queueItems)
				.set(changes)
				.where(eq(queueItems.id, id))
				.returning(columns);

			return row ? QueueItemSchema.parse(row) : null;
		},

		async removeQueued(opts: { id: string; queueId: string }): Promise<boolean> {
			const rows = await db
				.delete(queueItems)
				.where(
					and(
						eq(queueItems.id, opts.id),
						eq(queueItems.queueId, opts.queueId),
						inArray(queueItems.status, ['queued'])
					)
				)
				.returning({ id: queueItems.id });

			return rows.length > 0;
		}
	};
}

export type QueueItemRepo = ReturnType<typeof getQueueItemRepo>;
