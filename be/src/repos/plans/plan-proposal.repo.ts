import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { planProposals } from 'src/services/drizzle/schema';
import { PlanProposalSchema, type PlanProposal } from 'src/types/PlanProposalSchema';

const columns = {
	id: planProposals.id,
	projectId: planProposals.projectId,
	sourcePlanId: planProposals.sourcePlanId,
	buildId: planProposals.buildId,
	repositoryId: planProposals.repositoryId,
	title: planProposals.title,
	input: planProposals.input,
	status: planProposals.status,
	planId: planProposals.planId,
	decidedByUserId: planProposals.decidedByUserId,
	decidedAt: planProposals.decidedAt,
	createdAt: planProposals.createdAt
};

export function getPlanProposalRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			projectId: string;
			sourcePlanId: string;
			buildId: string;
			repositoryId: string | null;
			title: string;
			input: string;
		}): Promise<PlanProposal> {
			const [row] = await db.insert(planProposals).values(opts).returning(columns);

			return PlanProposalSchema.parse(row);
		},

		async getById(id: string): Promise<PlanProposal | null> {
			const [row] = await db.select(columns).from(planProposals).where(eq(planProposals.id, id));

			return row ? PlanProposalSchema.parse(row) : null;
		},

		async listOpenForProject(projectId: string): Promise<PlanProposal[]> {
			const rows = await db
				.select(columns)
				.from(planProposals)
				.where(and(eq(planProposals.projectId, projectId), eq(planProposals.status, 'open')))
				.orderBy(asc(planProposals.createdAt));

			return rows.map((row) => PlanProposalSchema.parse(row));
		},

		async listUnstartedForRepository(opts: { repositoryId: string; limit: number }): Promise<PlanProposal[]> {
			const rows = await db
				.select(columns)
				.from(planProposals)
				.where(and(eq(planProposals.repositoryId, opts.repositoryId), inArray(planProposals.status, ['open', 'dismissed'])))
				.orderBy(desc(planProposals.createdAt))
				.limit(opts.limit);

			return rows.map((row) => PlanProposalSchema.parse(row));
		},

		async countForBuild(buildId: string): Promise<number> {
			const [row] = await db.select({ total: count() }).from(planProposals).where(eq(planProposals.buildId, buildId));

			return row?.total ?? 0;
		},

		// Conditional on `open` so two people deciding the same proposal at once
		// settle it once: the second gets null, not an overwrite.
		async decide(opts: {
			id: string;
			status: 'started' | 'dismissed';
			planId: string | null;
			decidedByUserId: string;
		}): Promise<PlanProposal | null> {
			const [row] = await db
				.update(planProposals)
				.set({ status: opts.status, planId: opts.planId, decidedByUserId: opts.decidedByUserId, decidedAt: new Date() })
				.where(and(eq(planProposals.id, opts.id), eq(planProposals.status, 'open')))
				.returning(columns);

			return row ? PlanProposalSchema.parse(row) : null;
		}
	};
}

export type PlanProposalRepo = ReturnType<typeof getPlanProposalRepo>;
