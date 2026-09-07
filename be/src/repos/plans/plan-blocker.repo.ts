import { eq, inArray } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { planBlockers, plans } from 'src/services/drizzle/schema';
import { PlanSchema, type Plan } from 'src/types/PlanSchema';

export function getPlanBlockerRepo(db: DbOrTx) {
	return {
		// Replaced wholesale rather than added to. A session declaring what a plan
		// waits on is stating the complete list as it now understands it, and
		// merging would leave a blocker nobody can retract once it is wrong.
		async replace(opts: { planId: string; blockedByPlanIds: string[] }): Promise<void> {
			await db.delete(planBlockers).where(eq(planBlockers.planId, opts.planId));

			if (opts.blockedByPlanIds.length === 0) {
				return;
			}

			await db.insert(planBlockers).values(
				opts.blockedByPlanIds.map((blockedByPlanId) => ({
					planId: opts.planId,
					blockedByPlanId
				}))
			);
		},

		async listBlockers(planId: string): Promise<Plan[]> {
			const rows = await db
				.select({
					id: plans.id,
					userId: plans.userId,
					number: plans.number,
					machineId: plans.machineId,
					title: plans.title,
					bodyMd: plans.bodyMd,
					status: plans.status,
					failureReason: plans.failureReason,
					input: plans.input,
					createdAt: plans.createdAt
				})
				.from(planBlockers)
				.innerJoin(plans, eq(plans.id, planBlockers.blockedByPlanId))
				.where(eq(planBlockers.planId, planId));

			return rows.map((row) => PlanSchema.parse(row));
		},

		// One query for a whole queue: the scheduler asks about every queued plan at
		// once rather than per item, which is a round trip per plan on every advance.
		async listEdges(planIds: string[]): Promise<{ planId: string; blockedByPlanId: string }[]> {
			if (planIds.length === 0) {
				return [];
			}

			return db
				.select({
					planId: planBlockers.planId,
					blockedByPlanId: planBlockers.blockedByPlanId
				})
				.from(planBlockers)
				.where(inArray(planBlockers.planId, planIds));
		}
	};
}

export type PlanBlockerRepo = ReturnType<typeof getPlanBlockerRepo>;
