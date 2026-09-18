import { and, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { bugfixSessions } from 'src/services/drizzle/schema';
import { BugfixSessionSchema, type BugfixSession, type BugfixSessionEndedReason } from 'src/types/BugfixSchema';

const columns = {
	id: bugfixSessions.id,
	buildId: bugfixSessions.buildId,
	status: bugfixSessions.status,
	endedReason: bugfixSessions.endedReason,
	startedByUserId: bugfixSessions.startedByUserId,
	createdAt: bugfixSessions.createdAt,
	endedAt: bugfixSessions.endedAt
};

export function getBugfixSessionRepo(db: DbOrTx) {
	return {
		// Not itself the claim — the build's own `in_review` -> `fixing_bugs`
		// transition is what only one caller can win. This insert only runs once
		// that transition has already succeeded.
		async start(opts: { id: string; buildId: string; startedByUserId: string | null }): Promise<BugfixSession> {
			const [row] = await db.insert(bugfixSessions).values(opts).returning(columns);

			return BugfixSessionSchema.parse(row);
		},

		async getRunningForBuild(buildId: string): Promise<BugfixSession | null> {
			const [row] = await db
				.select(columns)
				.from(bugfixSessions)
				.where(and(eq(bugfixSessions.buildId, buildId), eq(bugfixSessions.status, 'running')));

			return row ? BugfixSessionSchema.parse(row) : null;
		},

		// Every session the idle sweep has to judge. Cheap: at most one row per
		// build, and a build holds `fixing_bugs` for as long as one of these runs.
		async listRunning(): Promise<BugfixSession[]> {
			const rows = await db.select(columns).from(bugfixSessions).where(eq(bugfixSessions.status, 'running'));

			return rows.map((row) => BugfixSessionSchema.parse(row));
		},

		// Guarded by status so a session already closed by another caller — the
		// idle timeout and a person pressing "Done" at once — is reported as
		// nothing to end rather than closed twice.
		async close(opts: { id: string; endedReason: BugfixSessionEndedReason }): Promise<BugfixSession | null> {
			const [row] = await db
				.update(bugfixSessions)
				.set({ status: 'closed', endedReason: opts.endedReason, endedAt: new Date() })
				.where(and(eq(bugfixSessions.id, opts.id), eq(bugfixSessions.status, 'running')))
				.returning(columns);

			return row ? BugfixSessionSchema.parse(row) : null;
		}
	};
}

export type BugfixSessionRepo = ReturnType<typeof getBugfixSessionRepo>;
