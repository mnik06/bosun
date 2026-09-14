import { and, asc, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { builds, repositories } from 'src/services/drizzle/schema';
import {
	BuildSchema,
	type Build,
	type BuildStatus,
	type NeedsYouReason
} from 'src/types/BuildSchema';

export const buildColumns = {
	id: builds.id,
	planId: builds.planId,
	repositoryId: builds.repositoryId,
	machineId: builds.machineId,
	position: builds.position,
	status: builds.status,
	needsYouReason: builds.needsYouReason,
	branch: builds.branch,
	baseBranch: builds.baseBranch,
	worktreePath: builds.worktreePath,
	portBase: builds.portBase,
	prNumber: builds.prNumber,
	prUrl: builds.prUrl,
	failureReason: builds.failureReason,
	createdAt: builds.createdAt,
	startedAt: builds.startedAt,
	builtAt: builds.builtAt,
	verifiedAt: builds.verifiedAt,
	finishedAt: builds.finishedAt,
	mergedAt: builds.mergedAt
};

const TERMINAL: BuildStatus[] = ['merged', 'cancelled'];

export interface BuildChanges {
	machineId?: string | null;
	position?: number;
	status?: BuildStatus;
	needsYouReason?: NeedsYouReason | null;
	branch?: string | null;
	baseBranch?: string | null;
	worktreePath?: string | null;
	portBase?: number | null;
	prNumber?: number | null;
	prUrl?: string | null;
	failureReason?: string | null;
	startedAt?: Date | null;
	builtAt?: Date | null;
	verifiedAt?: Date | null;
	finishedAt?: Date | null;
	mergedAt?: Date | null;
}

function parse(rows: unknown[]): Build[] {
	return rows.map((row) => BuildSchema.parse(row));
}

export function getBuildRepo(db: DbOrTx) {
	return {
		// The position is taken in the insert so two approvals racing cannot both read
		// the same end of the line.
		async create(opts: {
			id: string;
			planId: string;
			repositoryId: string;
			status: BuildStatus;
			needsYouReason?: NeedsYouReason | null;
			failureReason?: string | null;
		}): Promise<Build> {
			const [row] = await db
				.insert(builds)
				.values({
					...opts,
					position: sql`(select coalesce(max(${builds.position}), 0) + 1 from ${builds} where ${builds.repositoryId} = ${opts.repositoryId})`
				})
				.returning(buildColumns);

			return BuildSchema.parse(row);
		},

		// Scheduler-only and unscoped: reached from a frame or a timer whose machine or
		// repository has already been established.
		async getById(id: string): Promise<Build | null> {
			const [row] = await db.select(buildColumns).from(builds).where(eq(builds.id, id));

			return row ? BuildSchema.parse(row) : null;
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<Build | null> {
			const [row] = await db
				.select(buildColumns)
				.from(builds)
				.innerJoin(repositories, eq(repositories.id, builds.repositoryId))
				.where(and(eq(builds.id, opts.id), eq(repositories.projectId, opts.projectId)));

			return row ? BuildSchema.parse(row) : null;
		},

		// The build that says what a plan is doing: the newest one. An older attempt
		// that was cancelled or merged is history.
		async latestForPlans(planIds: string[]): Promise<Map<string, Build>> {
			if (planIds.length === 0) {
				return new Map();
			}

			const rows = await db
				.select(buildColumns)
				.from(builds)
				.where(inArray(builds.planId, planIds))
				.orderBy(desc(builds.createdAt));
			const latest = new Map<string, Build>();

			for (const build of parse(rows)) {
				if (!latest.has(build.planId)) {
					latest.set(build.planId, build);
				}
			}

			return latest;
		},

		async liveForPlan(planId: string): Promise<Build | null> {
			const [row] = await db
				.select(buildColumns)
				.from(builds)
				.where(and(eq(builds.planId, planId), notInArray(builds.status, TERMINAL)))
				.orderBy(desc(builds.createdAt))
				.limit(1);

			return row ? BuildSchema.parse(row) : null;
		},

		async listForRepository(opts: { repositoryId: string; statuses: BuildStatus[] }): Promise<Build[]> {
			const rows = await db
				.select(buildColumns)
				.from(builds)
				.where(and(eq(builds.repositoryId, opts.repositoryId), inArray(builds.status, opts.statuses)))
				.orderBy(asc(builds.position));

			return parse(rows);
		},

		async listForProject(opts: { projectId: string; statuses: BuildStatus[] }): Promise<Build[]> {
			const rows = await db
				.select(buildColumns)
				.from(builds)
				.innerJoin(repositories, eq(repositories.id, builds.repositoryId))
				.where(and(eq(repositories.projectId, opts.projectId), inArray(builds.status, opts.statuses)))
				.orderBy(asc(builds.position));

			return parse(rows);
		},

		async listForMachine(opts: { machineId: string; statuses: BuildStatus[] }): Promise<Build[]> {
			const rows = await db
				.select(buildColumns)
				.from(builds)
				.where(and(eq(builds.machineId, opts.machineId), inArray(builds.status, opts.statuses)))
				.orderBy(asc(builds.position));

			return parse(rows);
		},

		async listByPlans(opts: { planIds: string[]; statuses: BuildStatus[] }): Promise<Build[]> {
			if (opts.planIds.length === 0) {
				return [];
			}

			const rows = await db
				.select(buildColumns)
				.from(builds)
				.where(and(inArray(builds.planId, opts.planIds), inArray(builds.status, opts.statuses)));

			return parse(rows);
		},

		async findByBranch(opts: { repositoryId: string; branch: string }): Promise<Build | null> {
			const [row] = await db
				.select(buildColumns)
				.from(builds)
				.where(and(eq(builds.repositoryId, opts.repositoryId), eq(builds.branch, opts.branch)))
				.orderBy(desc(builds.createdAt))
				.limit(1);

			return row ? BuildSchema.parse(row) : null;
		},

		async listWithOpenPullRequests(): Promise<Build[]> {
			const rows = await db
				.select(buildColumns)
				.from(builds)
				.where(and(isNotNull(builds.prNumber), notInArray(builds.status, TERMINAL)));

			return parse(rows);
		},

		async portBasesInUse(machineId: string): Promise<number[]> {
			const rows = await db
				.select({ portBase: builds.portBase })
				.from(builds)
				.where(
					and(
						eq(builds.machineId, machineId),
						isNotNull(builds.portBase),
						notInArray(builds.status, [...TERMINAL, 'failed'])
					)
				);

			return rows.flatMap((row) => (row.portBase === null ? [] : [row.portBase]));
		},

		async frontPosition(repositoryId: string): Promise<number> {
			const [row] = await db
				.select({ front: sql<number>`coalesce(min(${builds.position}), 1) - 1` })
				.from(builds)
				.where(eq(builds.repositoryId, repositoryId));

			return Number(row?.front ?? 0);
		},

		async update(opts: { id: string } & BuildChanges): Promise<Build | null> {
			const { id, ...changes } = opts;
			const [row] = await db.update(builds).set(changes).where(eq(builds.id, id)).returning(buildColumns);

			return row ? BuildSchema.parse(row) : null;
		},

		// The status move is the claim. Two paths racing to move the same build — a
		// frame and a person pressing a button — both run this, and only the one whose
		// UPDATE still finds the status it expected gets a row back.
		async transition(opts: { id: string; from: BuildStatus[]; changes: BuildChanges }): Promise<Build | null> {
			const [row] = await db
				.update(builds)
				.set(opts.changes)
				.where(and(eq(builds.id, opts.id), inArray(builds.status, opts.from)))
				.returning(buildColumns);

			return row ? BuildSchema.parse(row) : null;
		},

		async setPositions(opts: { repositoryId: string; order: { id: string; position: number }[] }): Promise<void> {
			if (opts.order.length === 0) {
				return;
			}

			const cases = sql.join(
				opts.order.map((entry) => sql`when ${entry.id} then ${entry.position}::integer`),
				sql` `
			);

			await db
				.update(builds)
				.set({ position: sql`case ${builds.id} ${cases} end` })
				.where(
					and(
						eq(builds.repositoryId, opts.repositoryId),
						inArray(
							builds.id,
							opts.order.map((entry) => entry.id)
						)
					)
				);
		}
	};
}

export type BuildRepo = ReturnType<typeof getBuildRepo>;
