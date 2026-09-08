import { asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { planDecisions } from 'src/services/drizzle/schema';
import { PlanDecisionSchema, type PlanDecision } from 'src/types/PlanSchema';

const columns = {
	id: planDecisions.id,
	planId: planDecisions.planId,
	sliceId: planDecisions.sliceId,
	fork: planDecisions.fork,
	options: planDecisions.options,
	chose: planDecisions.chose,
	blastRadius: planDecisions.blastRadius,
	reversing: planDecisions.reversing,
	createdAt: planDecisions.createdAt
};

export function getPlanDecisionRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			planId: string;
			sliceId: string | null;
			fork: string;
			options: string | null;
			chose: string;
			blastRadius: string | null;
			reversing: string | null;
		}): Promise<PlanDecision> {
			const [row] = await db.insert(planDecisions).values(opts).returning(columns);

			return PlanDecisionSchema.parse(row);
		},

		async listByPlan(planId: string): Promise<PlanDecision[]> {
			const rows = await db
				.select(columns)
				.from(planDecisions)
				.where(eq(planDecisions.planId, planId))
				.orderBy(asc(planDecisions.createdAt));

			return rows.map((row) => PlanDecisionSchema.parse(row));
		}
	};
}

export type PlanDecisionRepo = ReturnType<typeof getPlanDecisionRepo>;
