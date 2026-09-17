import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { builds, integrations, sliceRuns } from 'src/services/drizzle/schema';
import {
	IntegrationSchema,
	type Integration,
	type IntegrationStatus,
	type IntegrationTrigger,
	type Regenerated,
	type ResolvedConflict
} from 'src/types/BuildSchema';

const columns = {
	id: integrations.id,
	buildId: integrations.buildId,
	trigger: integrations.trigger,
	onto: integrations.onto,
	ontoSha: integrations.ontoSha,
	status: integrations.status,
	merged: integrations.merged,
	regenerated: integrations.regenerated,
	resolved: integrations.resolved,
	checks: integrations.checks,
	detail: integrations.detail,
	createdAt: integrations.createdAt,
	startedAt: integrations.startedAt,
	finishedAt: integrations.finishedAt
};

function parse(rows: unknown[]): Integration[] {
	return rows.map((row) => IntegrationSchema.parse(row));
}

export function getIntegrationRepo(db: DbOrTx) {
	return {
		async create(opts: { id: string; buildId: string; trigger: IntegrationTrigger; onto: string }): Promise<Integration> {
			const [row] = await db.insert(integrations).values(opts).returning(columns);

			return IntegrationSchema.parse(row);
		},

		async getById(id: string): Promise<Integration | null> {
			const [row] = await db.select(columns).from(integrations).where(eq(integrations.id, id));

			return row ? IntegrationSchema.parse(row) : null;
		},

		async listForBuild(buildId: string): Promise<Integration[]> {
			const rows = await db
				.select(columns)
				.from(integrations)
				.where(eq(integrations.buildId, buildId))
				.orderBy(asc(integrations.createdAt));

			return parse(rows);
		},

		async listForBuilds(buildIds: string[]): Promise<Integration[]> {
			if (buildIds.length === 0) {
				return [];
			}

			const rows = await db
				.select(columns)
				.from(integrations)
				.where(inArray(integrations.buildId, buildIds))
				.orderBy(asc(integrations.createdAt));

			return parse(rows);
		},

		async listByStatusForMachine(opts: { machineId: string; statuses: IntegrationStatus[] }): Promise<Integration[]> {
			const rows = await db
				.select(columns)
				.from(integrations)
				.innerJoin(builds, eq(builds.id, integrations.buildId))
				.where(and(eq(builds.machineId, opts.machineId), inArray(integrations.status, opts.statuses)))
				.orderBy(asc(integrations.createdAt));

			return parse(rows);
		},

		// The same guard a run's claim has: nothing else of this build may be running
		// in its worktree, bullet or integration.
		async claim(id: string): Promise<Integration | null> {
			const [row] = await db
				.update(integrations)
				.set({ status: 'running', startedAt: new Date() })
				.where(
					and(
						eq(integrations.id, id),
						eq(integrations.status, 'pending'),
						sql`not exists (select 1 from ${sliceRuns} where build_id = ${integrations.buildId} and status = 'running')`,
						sql`not exists (select 1 from ${integrations} as other where other.build_id = ${integrations.buildId} and other.status = 'running')`
					)
				)
				.returning(columns);

			return row ? IntegrationSchema.parse(row) : null;
		},

		async update(opts: {
			id: string;
			status?: IntegrationStatus;
			ontoSha?: string | null;
			merged?: boolean;
			regenerated?: Regenerated[];
			resolved?: ResolvedConflict[];
			checks?: 'passed' | 'failed' | 'skipped' | null;
			detail?: string | null;
			startedAt?: Date | null;
			finishedAt?: Date | null;
		}): Promise<Integration | null> {
			const { id, ...changes } = opts;
			const [row] = await db.update(integrations).set(changes).where(eq(integrations.id, id)).returning(columns);

			return row ? IntegrationSchema.parse(row) : null;
		},

		async resetForBuild(opts: { buildId: string; from: IntegrationStatus[] }): Promise<number> {
			const rows = await db
				.update(integrations)
				.set({ status: 'pending', startedAt: null, finishedAt: null, detail: null })
				.where(and(eq(integrations.buildId, opts.buildId), inArray(integrations.status, opts.from)))
				.returning({ id: integrations.id });

			return rows.length;
		}
	};
}

export type IntegrationRepo = ReturnType<typeof getIntegrationRepo>;
