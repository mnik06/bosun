import { and, asc, eq, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { sliceRuns } from 'src/services/drizzle/schema';
import { SliceRunSchema, type SliceRun, type SliceRunStatus } from 'src/types/QueueSchema';

const columns = {
	id: sliceRuns.id,
	queueItemId: sliceRuns.queueItemId,
	sliceId: sliceRuns.sliceId,
	ordinal: sliceRuns.ordinal,
	status: sliceRuns.status,
	commitSha: sliceRuns.commitSha,
	failureReason: sliceRuns.failureReason,
	startedAt: sliceRuns.startedAt,
	finishedAt: sliceRuns.finishedAt
};

export function getSliceRunRepo(db: DbOrTx) {
	return {
		async createMany(
			rows: { id: string; queueItemId: string; sliceId: string; ordinal: number }[]
		): Promise<SliceRun[]> {
			if (rows.length === 0) {
				return [];
			}

			const created = await db.insert(sliceRuns).values(rows).returning(columns);

			return created.map((row) => SliceRunSchema.parse(row));
		},

		async listForItem(queueItemId: string): Promise<SliceRun[]> {
			const rows = await db
				.select(columns)
				.from(sliceRuns)
				.where(eq(sliceRuns.queueItemId, queueItemId))
				.orderBy(asc(sliceRuns.ordinal));

			return rows.map((row) => SliceRunSchema.parse(row));
		},

		async getById(id: string): Promise<SliceRun | null> {
			const [row] = await db.select(columns).from(sliceRuns).where(eq(sliceRuns.id, id));

			return row ? SliceRunSchema.parse(row) : null;
		},

		// Same claim-by-transition as queue items: whichever call flips the lowest
		// `pending` row to `running` owns it, and everyone else gets null.
		async claimNext(queueItemId: string): Promise<SliceRun | null> {
			const [row] = await db
				.update(sliceRuns)
				.set({ status: 'running', startedAt: new Date() })
				.where(
					and(
						eq(sliceRuns.queueItemId, queueItemId),
						eq(sliceRuns.status, 'pending'),
						eq(
							sliceRuns.id,
							sql`(select id from ${sliceRuns} where queue_item_id = ${queueItemId} and status = 'pending' order by ordinal asc limit 1)`
						)
					)
				)
				.returning(columns);

			return row ? SliceRunSchema.parse(row) : null;
		},

		async update(opts: {
			id: string;
			status?: SliceRunStatus;
			commitSha?: string | null;
			failureReason?: string | null;
			finishedAt?: Date | null;
		}): Promise<SliceRun | null> {
			const { id, ...changes } = opts;
			const [row] = await db
				.update(sliceRuns)
				.set(changes)
				.where(eq(sliceRuns.id, id))
				.returning(columns);

			return row ? SliceRunSchema.parse(row) : null;
		}
	};
}

export type SliceRunRepo = ReturnType<typeof getSliceRunRepo>;
