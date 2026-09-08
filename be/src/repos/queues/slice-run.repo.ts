import { and, asc, eq, inArray, sql } from 'drizzle-orm';
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

// Exported so the statement can be asserted without a database. What this does
// under concurrency is a property of the SQL, and the failure it prevents — two
// sessions in one worktree — is invisible until it has already happened.
export function noRunInFlight(queueItemId: string) {
	return sql`not exists (select 1 from ${sliceRuns} where queue_item_id = ${queueItemId} and status = 'running')`;
}

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

		// Two guards, and both are load-bearing. The `id = (lowest pending)` clause
		// stops two callers taking the *same* row; the `not exists` clause stops them
		// taking *different* ones. Without the second, a settling bullet that
		// advances the queue twice — once directly and once through the machine
		// sweep — starts two sessions in the same worktree, seconds apart, and the
		// only symptom is two bullets spinning at once in the browser.
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
						),
						noRunInFlight(queueItemId)
					)
				)
				.returning(columns);

			return row ? SliceRunSchema.parse(row) : null;
		},

		// A retry keeps what landed and re-arms what did not. The `done` runs hold
		// commits that are already on the branch — resetting those would rebuild work
		// the plan has, and on a bullet that took an hour that is the whole point of
		// retrying rather than requeuing.
		async resetUnfinished(queueItemId: string): Promise<number> {
			const rows = await db
				.update(sliceRuns)
				.set({ status: 'pending', failureReason: null, startedAt: null, finishedAt: null })
				.where(
					and(
						eq(sliceRuns.queueItemId, queueItemId),
						inArray(sliceRuns.status, ['failed', 'running'])
					)
				)
				.returning({ id: sliceRuns.id });

			return rows.length;
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
