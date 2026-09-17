import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { planDependencies } from 'src/services/drizzle/schema';
import {
	PlanDependencySchema,
	type DependencySource,
	type PlanDependency
} from 'src/types/BuildSchema';

const columns = {
	id: planDependencies.id,
	planId: planDependencies.planId,
	providerPlanId: planDependencies.providerPlanId,
	providerSliceId: planDependencies.providerSliceId,
	source: planDependencies.source,
	reason: planDependencies.reason,
	overriddenByUserId: planDependencies.overriddenByUserId,
	overriddenAt: planDependencies.overriddenAt,
	createdAt: planDependencies.createdAt
};

function parse(rows: unknown[]): PlanDependency[] {
	return rows.map((row) => PlanDependencySchema.parse(row));
}

export interface NewDependency {
	id: string;
	planId: string;
	providerPlanId: string;
	providerSliceId: string | null;
	source: DependencySource;
	reason: string;
}

export function getPlanDependencyRepo(db: DbOrTx) {
	return {
		async createMany(rows: NewDependency[]): Promise<PlanDependency[]> {
			if (rows.length === 0) {
				return [];
			}

			return parse(await db.insert(planDependencies).values(rows).returning(columns));
		},

		async listForPlan(planId: string): Promise<PlanDependency[]> {
			return parse(
				await db
					.select(columns)
					.from(planDependencies)
					.where(eq(planDependencies.planId, planId))
					.orderBy(asc(planDependencies.createdAt))
			);
		},

		async listForPlans(planIds: string[]): Promise<PlanDependency[]> {
			if (planIds.length === 0) {
				return [];
			}

			return parse(await db.select(columns).from(planDependencies).where(inArray(planDependencies.planId, planIds)));
		},

		async listByProviders(providerPlanIds: string[]): Promise<PlanDependency[]> {
			if (providerPlanIds.length === 0) {
				return [];
			}

			return parse(
				await db.select(columns).from(planDependencies).where(inArray(planDependencies.providerPlanId, providerPlanIds))
			);
		},

		// Replaced wholesale per source: a session declaring what a plan needs states
		// the complete list, and detection recomputes its own on every approval.
		async replaceForSource(opts: { planId: string; source: DependencySource; rows: NewDependency[] }): Promise<void> {
			await db
				.delete(planDependencies)
				.where(
					and(
						eq(planDependencies.planId, opts.planId),
						eq(planDependencies.source, opts.source),
						isNull(planDependencies.overriddenAt)
					)
				);

			if (opts.rows.length > 0) {
				await db.insert(planDependencies).values(opts.rows);
			}
		},

		async override(opts: { id: string; planId: string; userId: string }): Promise<PlanDependency | null> {
			const [row] = await db
				.update(planDependencies)
				.set({ overriddenByUserId: opts.userId, overriddenAt: new Date() })
				.where(
					and(
						eq(planDependencies.id, opts.id),
						eq(planDependencies.planId, opts.planId),
						isNull(planDependencies.overriddenAt)
					)
				)
				.returning(columns);

			return row ? PlanDependencySchema.parse(row) : null;
		}
	};
}

export type PlanDependencyRepo = ReturnType<typeof getPlanDependencyRepo>;
