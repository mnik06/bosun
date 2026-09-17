import { asc, eq } from 'drizzle-orm';
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

export function getPlanBugRepo(db: DbOrTx) {
	return {
		async listForBuild(buildId: string): Promise<PlanBug[]> {
			const rows = await db.select(columns).from(planBugs).where(eq(planBugs.buildId, buildId)).orderBy(asc(planBugs.seq));

			return rows.map((row) => PlanBugSchema.parse(row));
		}
	};
}

export type PlanBugRepo = ReturnType<typeof getPlanBugRepo>;
