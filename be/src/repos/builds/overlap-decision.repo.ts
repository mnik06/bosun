import { and, asc, eq, isNull } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { overlapDecisions, plans } from 'src/services/drizzle/schema';
import {
	OverlapDecisionSchema,
	type OverlapChoice,
	type OverlapDecision,
	type OverlapItem
} from 'src/types/BuildSchema';

const columns = {
	id: overlapDecisions.id,
	planId: overlapDecisions.planId,
	providerPlanId: overlapDecisions.providerPlanId,
	item: overlapDecisions.item,
	options: overlapDecisions.options,
	chosen: overlapDecisions.chosen,
	decidedByUserId: overlapDecisions.decidedByUserId,
	decidedAt: overlapDecisions.decidedAt,
	createdAt: overlapDecisions.createdAt
};

export function getOverlapDecisionRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			planId: string;
			providerPlanId: string;
			item: OverlapItem;
			options: OverlapChoice[];
		}): Promise<OverlapDecision> {
			const [row] = await db.insert(overlapDecisions).values(opts).returning(columns);

			return OverlapDecisionSchema.parse(row);
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<OverlapDecision | null> {
			const [row] = await db
				.select(columns)
				.from(overlapDecisions)
				.innerJoin(plans, eq(plans.id, overlapDecisions.planId))
				.where(and(eq(overlapDecisions.id, opts.id), eq(plans.projectId, opts.projectId)));

			return row ? OverlapDecisionSchema.parse(row) : null;
		},

		async listForPlan(planId: string): Promise<OverlapDecision[]> {
			const rows = await db
				.select(columns)
				.from(overlapDecisions)
				.where(eq(overlapDecisions.planId, planId))
				.orderBy(asc(overlapDecisions.createdAt));

			return rows.map((row) => OverlapDecisionSchema.parse(row));
		},

		// Only an open decision can be decided: two people answering at once get one
		// ruling, not the last one.
		async decide(opts: { id: string; chosen: OverlapChoice; userId: string }): Promise<OverlapDecision | null> {
			const [row] = await db
				.update(overlapDecisions)
				.set({ chosen: opts.chosen, decidedByUserId: opts.userId, decidedAt: new Date() })
				.where(and(eq(overlapDecisions.id, opts.id), isNull(overlapDecisions.chosen)))
				.returning(columns);

			return row ? OverlapDecisionSchema.parse(row) : null;
		},

		async deleteOpenForPlan(planId: string): Promise<void> {
			await db.delete(overlapDecisions).where(and(eq(overlapDecisions.planId, planId), isNull(overlapDecisions.chosen)));
		}
	};
}

export type OverlapDecisionRepo = ReturnType<typeof getOverlapDecisionRepo>;
