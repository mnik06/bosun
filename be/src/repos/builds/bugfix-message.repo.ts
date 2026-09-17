import { asc, eq, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { bugfixMessages } from 'src/services/drizzle/schema';
import { BugfixMessageSchema, type BugfixMessage, type BugfixMessageContent, type BugfixMessageRole } from 'src/types/BugfixSchema';

const columns = {
	id: bugfixMessages.id,
	buildId: bugfixMessages.buildId,
	seq: bugfixMessages.seq,
	role: bugfixMessages.role,
	content: bugfixMessages.content,
	createdAt: bugfixMessages.createdAt
};

export function getBugfixMessageRepo(db: DbOrTx) {
	return {
		// The next sequence number is computed inside the insert, on the same terms
		// as `plan_messages`: a read-then-write would hand the same number to a
		// stream frame and a message arriving over HTTP at once.
		async append(opts: { id: string; buildId: string; role: BugfixMessageRole; content: BugfixMessageContent }): Promise<BugfixMessage> {
			const [row] = await db
				.insert(bugfixMessages)
				.values({
					id: opts.id,
					buildId: opts.buildId,
					role: opts.role,
					content: opts.content,
					seq: sql`(select coalesce(max(${bugfixMessages.seq}), 0) + 1 from ${bugfixMessages} where ${bugfixMessages.buildId} = ${opts.buildId})`
				})
				.returning(columns);

			return BugfixMessageSchema.parse(row);
		},

		async listByBuild(buildId: string): Promise<BugfixMessage[]> {
			const rows = await db.select(columns).from(bugfixMessages).where(eq(bugfixMessages.buildId, buildId)).orderBy(asc(bugfixMessages.seq));

			return rows.map((row) => BugfixMessageSchema.parse(row));
		}
	};
}

export type BugfixMessageRepo = ReturnType<typeof getBugfixMessageRepo>;
