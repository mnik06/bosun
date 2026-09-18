import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { planBugs } from 'src/services/drizzle/schema';
import { PlanBugSchema, type PlanBug } from 'src/types/BugfixSchema';

const columns = {
	id: planBugs.id,
	buildId: planBugs.buildId,
	seq: planBugs.seq,
	description: planBugs.description,
	status: planBugs.status,
	note: planBugs.note,
	createdAt: planBugs.createdAt,
	updatedAt: planBugs.updatedAt
};

const UNRESOLVED_STATUSES = ['pending', 'fixing'] as const;

export function getPlanBugRepo(db: DbOrTx) {
	return {
		async listForBuild(buildId: string): Promise<PlanBug[]> {
			const rows = await db.select(columns).from(planBugs).where(eq(planBugs.buildId, buildId)).orderBy(asc(planBugs.seq));

			return rows.map((row) => PlanBugSchema.parse(row));
		},

		async getById(id: string): Promise<PlanBug | null> {
			const [row] = await db.select(columns).from(planBugs).where(eq(planBugs.id, id));

			return row ? PlanBugSchema.parse(row) : null;
		},

		// One description per row, appended after whatever this build already has —
		// a later round's report_bugs call adds to the same list rather than
		// replacing it. The next seq is computed inside the insert, on the same
		// terms as `bugfix_messages`: a read-then-write would hand the same number
		// to two rounds that overlapped.
		async createBatch(opts: { buildId: string; rows: { id: string; description: string }[] }): Promise<PlanBug[]> {
			const rows = await db
				.insert(planBugs)
				.values(
					opts.rows.map((row, index) => ({
						id: row.id,
						buildId: opts.buildId,
						description: row.description,
						seq: sql`(select coalesce(max(${planBugs.seq}), 0) from ${planBugs} where ${planBugs.buildId} = ${opts.buildId}) + ${index + 1}`
					}))
				)
				.returning(columns);

			return rows.map((row) => PlanBugSchema.parse(row)).sort((a, b) => a.seq - b.seq);
		},

		async updateStatus(opts: { id: string; status: PlanBug['status']; note: string | null }): Promise<PlanBug | null> {
			const [row] = await db
				.update(planBugs)
				.set({ status: opts.status, note: opts.note, updatedAt: new Date() })
				.where(eq(planBugs.id, opts.id))
				.returning(columns);

			return row ? PlanBugSchema.parse(row) : null;
		},

		// Every bug this build's session never got to. Used only when a session
		// force-ends — a merge, a cancel — never by a person, and never by a plain
		// "Done": see `end-bugfix-session.ts`.
		async failUnresolved(opts: { buildId: string; note: string }): Promise<PlanBug[]> {
			const rows = await db
				.update(planBugs)
				.set({ status: 'failed', note: opts.note, updatedAt: new Date() })
				.where(and(eq(planBugs.buildId, opts.buildId), inArray(planBugs.status, UNRESOLVED_STATUSES)))
				.returning(columns);

			return rows.map((row) => PlanBugSchema.parse(row));
		}
	};
}

export type PlanBugRepo = ReturnType<typeof getPlanBugRepo>;
