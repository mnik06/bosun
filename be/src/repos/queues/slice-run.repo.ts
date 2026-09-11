import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { sliceRuns } from 'src/services/drizzle/schema';
import { type PlanQuestion } from 'src/types/PlanSchema';
import { SliceRunSchema, type SliceRun, type SliceRunStatus } from 'src/types/QueueSchema';

const columns = {
	id: sliceRuns.id,
	queueItemId: sliceRuns.queueItemId,
	sliceId: sliceRuns.sliceId,
	ordinal: sliceRuns.ordinal,
	status: sliceRuns.status,
	questionId: sliceRuns.questionId,
	question: sliceRuns.question,
	commitSha: sliceRuns.commitSha,
	report: sliceRuns.report,
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
				.set({
					status: 'pending',
					failureReason: null,
					questionId: null,
					question: null,
					startedAt: null,
					finishedAt: null
				})
				.where(
					and(
						eq(sliceRuns.queueItemId, queueItemId),
						inArray(sliceRuns.status, ['failed', 'running'])
					)
				)
				.returning({ id: sliceRuns.id });

			return rows.length;
		},

		// One finished bullet, armed to run again while the ones before it keep their
		// commits. The status guard is what makes it safe to expose: a `pending` or
		// `running` row is either waiting its turn or holding the worktree, and
		// clearing either of those would dispatch a second session into it.
		//
		// The report and the commit go with the attempt that produced them. The
		// commits themselves stay on the branch — this is a re-run of a bullet, not
		// an undo of one.
		async rearm(opts: { id: string; queueItemId: string }): Promise<SliceRun | null> {
			const [row] = await db
				.update(sliceRuns)
				.set({
					status: 'pending',
					failureReason: null,
					questionId: null,
					question: null,
					commitSha: null,
					report: null,
					startedAt: null,
					finishedAt: null
				})
				.where(
					and(
						eq(sliceRuns.id, opts.id),
						eq(sliceRuns.queueItemId, opts.queueItemId),
						inArray(sliceRuns.status, ['done', 'failed']),
						noRunInFlight(opts.queueItemId)
					)
				)
				.returning(columns);

			return row ? SliceRunSchema.parse(row) : null;
		},

		// Set when a session asks, cleared when it is answered and whenever the run
		// stops waiting for any other reason — a question outlived by its session is
		// a control that answers nothing.
		async setQuestion(opts: {
			id: string;
			questionId: string | null;
			question: PlanQuestion[] | null;
		}): Promise<void> {
			await db
				.update(sliceRuns)
				.set({ questionId: opts.questionId, question: opts.question })
				.where(eq(sliceRuns.id, opts.id));
		},

		async update(opts: {
			id: string;
			status?: SliceRunStatus;
			questionId?: string | null;
			question?: PlanQuestion[] | null;
			commitSha?: string | null;
			report?: string | null;
			failureReason?: string | null;
			startedAt?: Date | null;
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
