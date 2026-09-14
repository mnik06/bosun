import { asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { planAmendments } from 'src/services/drizzle/schema';
import { PlanAmendmentSchema, type PlanAmendment } from 'src/types/BuildSchema';

const columns = {
	id: planAmendments.id,
	planId: planAmendments.planId,
	sourcePlanId: planAmendments.sourcePlanId,
	text: planAmendments.text,
	createdAt: planAmendments.createdAt
};

export function getPlanAmendmentRepo(db: DbOrTx) {
	return {
		async create(opts: { id: string; planId: string; sourcePlanId: string | null; text: string }): Promise<PlanAmendment> {
			const [row] = await db.insert(planAmendments).values(opts).returning(columns);

			return PlanAmendmentSchema.parse(row);
		},

		async listForPlan(planId: string): Promise<PlanAmendment[]> {
			const rows = await db
				.select(columns)
				.from(planAmendments)
				.where(eq(planAmendments.planId, planId))
				.orderBy(asc(planAmendments.createdAt));

			return rows.map((row) => PlanAmendmentSchema.parse(row));
		}
	};
}

export type PlanAmendmentRepo = ReturnType<typeof getPlanAmendmentRepo>;
